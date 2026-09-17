import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestShareUploadUrlBody,
  RequestShareUploadUrlResponse,
} from "@workspace/api-zod";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_SHARE_BYTES = 50 * 1024 * 1024;

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