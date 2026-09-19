import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateSharedAudioBody,
  RequestShareUploadUrlBody,
  RequestShareUploadUrlResponse,
} from "@workspace/api-zod";
import { db, sharedAudioTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_SHARE_BYTES = 50 * 1024 * 1024;

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
        metadata.contentType !== "audio/wav"
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
    if (
      !name.toLowerCase().endsWith(".wav") ||
      contentType !== "audio/wav" ||
      size > MAX_SHARE_BYTES
    ) {
      res.status(400).json({ error: "Only WAV files up to 50MB can be shared" });
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