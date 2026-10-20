import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import type { ObjectStorageService } from "./objectStorage";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export function isSupportedVideoUpload(
  name: string,
  size: number,
  contentType: string,
) {
  const lowerName = name.toLowerCase();
  const hasVideoExtension = /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(lowerName);
  return (
    hasVideoExtension &&
    contentType.startsWith("video/") &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= MAX_VIDEO_BYTES
  );
}

export class VideoAudioConversionError extends Error {
  readonly noAudioTrack: boolean;
  readonly tooLarge: boolean;

  constructor(message: string, noAudioTrack = false, tooLarge = false) {
    super(message);
    this.name = "VideoAudioConversionError";
    this.noAudioTrack = noAudioTrack;
    this.tooLarge = tooLarge;
  }
}

export async function convertStoredVideoToMp3(
  objectStorageService: ObjectStorageService,
  objectPath: string,
) {
  const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await objectFile.getMetadata();
  const sourceSize = Number(metadata.size);
  if (sourceSize > MAX_VIDEO_BYTES) {
    throw new VideoAudioConversionError("Video exceeds maximum size", false, true);
  }
  if (
    !Number.isFinite(sourceSize) ||
    sourceSize <= 0 ||
    !metadata.contentType?.startsWith("video/")
  ) {
    throw new Error("Video file is too large or empty");
  }

  const workDir = await mkdtemp(join(tmpdir(), "bassline-video-"));
  const sourcePath = join(workDir, "source-video");
  const outputPath = join(workDir, "extracted-audio.mp3");
  const cleanup = () => rm(workDir, { recursive: true, force: true });

  try {
    await pipeline(objectFile.createReadStream(), createWriteStream(sourcePath));
    await runFfmpeg(sourcePath, outputPath);
    const outputStats = await stat(outputPath);
    if (!outputStats.size) {
      throw new Error("FFmpeg produced an empty audio file");
    }
    return { outputPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function runFfmpeg(sourcePath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:a:0",
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        outputPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    process.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8_000) stderr += chunk.toString();
    });
    process.once("error", reject);
    process.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const message = stderr.trim() || `FFmpeg exited with code ${code ?? "unknown"}`;
      const noAudioTrack = /matches no streams|does not contain any stream|audio stream.*not found/i.test(message);
      reject(new VideoAudioConversionError(
        noAudioTrack ? "The video does not contain a readable audio track" : message,
        noAudioTrack,
      ));
    });
  });
}