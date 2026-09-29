import { db } from "@/lib/db";
import { ALLOWED_MIME_TYPES, newStorageKey, putFile, removeFile } from "@/lib/storage";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function saveUpload(orgId: string, userId: string, file: File) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Dateityp nicht unterstützt (erlaubt: JPG, PNG, WebP, PDF)");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Datei ist zu groß (max. 20 MB)");
  const data = Buffer.from(await file.arrayBuffer());
  const storageKey = newStorageKey(orgId, file.type);
  await putFile(storageKey, data, file.type);
  const record = await db.file.create({
    data: {
      organizationId: orgId,
      storageKey,
      originalName: file.name?.slice(0, 190) || null,
      mimeType: file.type,
      size: file.size,
      uploadedById: userId,
    },
  });
  return { record, data };
}

export async function deleteFile(orgId: string, fileId: string) {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId: orgId } });
  if (!file) return;
  await db.file.delete({ where: { id: file.id } });
  await removeFile(file.storageKey).catch(() => undefined);
}
