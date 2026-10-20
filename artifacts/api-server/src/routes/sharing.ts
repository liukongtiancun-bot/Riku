import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateSharedAudioBody,
  ProcessVideoAudioBody,
  RequestVideoAudioUploadUrlBody,
  RequestVideoAudioUploadUrlResponse,
  RequestShareUploadUrlBody,
  RequestShareUploadUrlResponse,
} from "@workspace/api-zod";
import { db, sharedAudioTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  convertStoredVideoToMp3,
  isSupportedVideoUpload,
  VideoAudioConversionError,
} from "../lib/videoProcessing";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_SHARE_BYTES = 50 * 1024 * 1024;
const SHARE_AUDIO_CONTENT_TYPES = new Set(["audio/wav", "audio/mpeg", "audio/mp3"]);
let activeVideoConversions = 0;
const MAX_CONCURRENT_VIDEO_CONVERSIONS = 2;

async function deleteTemporaryVideo(objectPath: string, req: Request) {
  try {
    await objectStorageService.deleteObjectEntity(objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      req.log.warn({ err: error }, "Failed to delete temporary uploaded video");
    }
  }
}

router.post(
  "/storage/video-audio/request-url",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestVideoAudioUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      const tooLarge = parsed.error.issues.some(
        (issue) => issue.path[0] === "size" && issue.code === "too_big",
      );
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? "Video exceeds the 500MB upload limit" : "Invalid video metadata",
      });
      return;
    }
    const { name, size, contentType } = parsed.data;
    if (!isSupportedVideoUpload(name, size, contentType)) {
      res.status(400).json({
        error: "Choose a supported video file up to 500MB.",
      });
      return;
    }

    try {
      const { uploadURL, objectPath } =
        await objectStorageService.getObjectEntityUploadURL(60 * 60);
      res.status(201).json(
        RequestVideoAudioUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          expiresInSeconds: 60 * 60,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating video upload URL");
      res.status(500).json({ error: "Failed to prepare video upload" });
    }
  },
);

router.post(
  "/storage/video-audio",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ProcessVideoAudioBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid video object path" });
      return;
    }
    if (activeVideoConversions >= MAX_CONCURRENT_VIDEO_CONVERSIONS) {
      await deleteTemporaryVideo(parsed.data.objectPath, req);
      res.status(429).json({ error: "Video conversion is busy. Please retry shortly." });
      return;
    }

    activeVideoConversions += 1;
    let converted: Awaited<ReturnType<typeof convertStoredVideoToMp3>> | undefined;
    try {
      converted = await convertStoredVideoToMp3(
        objectStorageService,
        parsed.data.objectPath,
      );
      const outputStats = await stat(converted.outputPath);
      res.status(200);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", outputStats.size);
      res.setHeader("Cache-Control", "no-store");
      await pipeline(createReadStream(converted.outputPath), res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        if (!res.headersSent) res.status(404).json({ error: "Temporary video not found" });
        return;
      }
      if (error instanceof VideoAudioConversionError && error.noAudioTrack) {
        if (!res.headersSent) res.status(422).json({ error: "No readable audio track was found in the video" });
        return;
      }
      if (error instanceof VideoAudioConversionError && error.tooLarge) {
        if (!res.headersSent) res.status(413).json({ error: "Video exceeds the 500MB upload limit" });
        return;
      }
      req.log.error({ err: error }, "Error extracting video audio");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to extract audio from video" });
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    } finally {
      activeVideoConversions -= 1;
      try {
        await converted?.cleanup();
      } catch (error) {
        req.log.warn({ err: error }, "Failed to clean temporary conversion files");
      }
      await deleteTemporaryVideo(parsed.data.objectPath, req);
    }
  },
);

router.get(
  "/storage/tracks",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const tracks = await db
        .select()
        .from(sharedAudioTable)
        .orderBy(desc(sharedAudioTable.createdAt));
      res.status(200).json(tracks);
    } catch (error) {
      res.status(500).json({ error: "Failed to list shared audio" });
    }
  },
);

router.post(
  "/storage/tracks",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateSharedAudioBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid shared audio metadata" });
      return;
    }

    const input = parsed.data;
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        input.objectPath,
      );
      const [metadata] = await objectFile.getMetadata();
      const storedSize = Number(metadata.size);
      if (
        !Number.isFinite(storedSize) ||
        storedSize !== input.fileSize ||
        !SHARE_AUDIO_CONTENT_TYPES.has(metadata.contentType || "")
      ) {
        res.status(400).json({ error: "Uploaded audio metadata does not match" });
        return;
      }

      const [existing] = await db
        .select({ id: sharedAudioTable.id })
        .from(sharedAudioTable)
        .where(eq(sharedAudioTable.objectPath, input.objectPath))
        .limit(1);
      if (existing) {
        res.status(409).json({ error: "Audio has already been published" });
        return;
      }

      const [track] = await db
        .insert(sharedAudioTable)
        .values(input)
        .returning();
      res.status(201).json(track);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Uploaded audio not found" });
        return;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({ error: "Audio has already been published" });
        return;
      }
      req.log.error({ err: error }, "Error publishing shared audio");
      res.status(500).json({ error: "Failed to publish shared audio" });
    }
  },
);

router.post(
  "/storage/shares/request-url",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestShareUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid audio metadata" });
      return;
    }

    const { name, size, contentType } = parsed.data;
    const lowerName = name.toLowerCase();
    const isWav = lowerName.endsWith(".wav") && contentType === "audio/wav";
    const isMp3 =
      lowerName.endsWith(".mp3") &&
      (contentType === "audio/mpeg" || contentType === "audio/mp3");
    if ((!isWav && !isMp3) || size > MAX_SHARE_BYTES) {
      res.status(400).json({ error: "Only MP3 or WAV files up to 50MB can be shared" });
      return;
    }

    try {
      const { uploadURL, objectPath } =
        await objectStorageService.getObjectEntityUploadURL();
      res.status(201).json(
        RequestShareUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          expiresInSeconds: 900,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating share upload URL");
      res.status(500).json({ error: "Failed to prepare audio sharing" });
    }
  },
);

router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response): Promise<void> => {
    const rawPath = req.params.path;
    const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
    try {
      const downloadURL =
        await objectStorageService.getObjectEntityDownloadURL(objectPath);
      res.redirect(302, downloadURL);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Shared audio not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving shared audio");
      res.status(500).json({ error: "Failed to serve shared audio" });
    }
  },
);

export default router;