import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  private getPrivateObjectDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR is not configured");
    }
    return dir.replace(/\/$/, "");
  }

  async getObjectEntityUploadURL() {
    const objectPath = `/objects/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}${objectPath.slice("/objects".length)}`,
    );
    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
    return { uploadURL, objectPath };
  }

  async getObjectEntityDownloadURL(objectPath: string) {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const [metadata] = await objectFile.getMetadata();
    const uploadPath = metadata.name;
    if (!uploadPath) {
      throw new ObjectNotFoundError();
    }
    const { bucketName } = parseObjectPath(this.getPrivateObjectDir());
    return signObjectURL({
      bucketName,
      objectName: uploadPath,
      method: "GET",
      ttlSec: 3600,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[a-z0-9-]+$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }
    const objectName = `${this.getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
    const { bucketName, objectName: parsedObjectName } = parseObjectPath(
      `/${objectName}`,
    );
    const file = objectStorageClient.bucket(bucketName).file(parsedObjectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  normalizeObjectEntityPath(rawPath: string) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const privateDir = this.getPrivateObjectDir();
    const rawObjectPath = url.pathname;
    if (!rawObjectPath.startsWith(privateDir)) {
      throw new Error("Upload URL is outside the configured object directory");
    }
    return `/objects/${rawObjectPath.slice(`${privateDir}/`.length)}`;
  }
}

function parseObjectPath(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) {
    throw new Error("Invalid object path");
  }
  return {
    bucketName: parts[0],
    objectName: parts.slice(1).join("/"),
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT";
  ttlSec: number;
}) {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const data = (await response.json()) as { signed_url?: string };
  if (!data.signed_url) {
    throw new Error("Object storage did not return a signed URL");
  }
  return data.signed_url;
}