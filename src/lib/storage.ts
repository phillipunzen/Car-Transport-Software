import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Datei-Speicher. "local" schreibt in ein (Docker-)Volume, "s3" in einen
 * S3-kompatiblen Bucket – nötig, sobald mehrere Container parallel laufen.
 */
interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  private root = path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Ungültiger Pfad");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private bucket = process.env.S3_BUCKET!;
  private client = new S3Client({
    region: process.env.S3_REGION || "eu-central-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "" }
      : undefined,
  });
  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | undefined;
function storage(): StorageDriver {
  driver ??= process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return driver;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function newStorageKey(orgId: string, mimeType: string) {
  return `${orgId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mimeType] ?? "bin"}`;
}

export const putFile = (key: string, data: Buffer, contentType: string) => storage().put(key, data, contentType);
export const getFile = (key: string) => storage().get(key);
export const removeFile = (key: string) => storage().remove(key);
export const ALLOWED_MIME_TYPES = Object.keys(EXT);
