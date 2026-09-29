import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getFile } from "@/lib/storage";

/** Liefert eine hochgeladene Datei aus – nur für Mitglieder der jeweiligen Instanz. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = await db.file.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  const member = await db.membership.findFirst({ where: { userId: session.user.id, organizationId: file.organizationId } });
  if (!member) return new NextResponse("Not found", { status: 404 });

  const data = await getFile(file.storageKey);
  const download = new URL(req.url).searchParams.has("download");
  const name = encodeURIComponent(file.originalName ?? `datei-${file.id}`);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
