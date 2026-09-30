import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFile } from "@/lib/storage";

/** Firmenlogo für öffentliche Seiten (Status-Link, Anfrageformular) – nur Bilder, nur das Logo. */
export async function logoResponse(logoFileId: string | null | undefined) {
  if (!logoFileId) return new NextResponse("Not found", { status: 404 });
  const file = await db.file.findUnique({ where: { id: logoFileId } });
  if (!file || !file.mimeType.startsWith("image/")) return new NextResponse("Not found", { status: 404 });
  const data = await getFile(file.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": file.mimeType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

/** Tracking-Token prüfen (Länge/Zeichen), bevor die Datenbank gefragt wird. */
export const validToken = (t: string) => /^[A-Za-z0-9_-]{16,64}$/.test(t);
