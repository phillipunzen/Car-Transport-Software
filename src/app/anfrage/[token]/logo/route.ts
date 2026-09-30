import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logoResponse, validToken } from "@/lib/public";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return new NextResponse("Not found", { status: 404 });
  const org = await db.organization.findUnique({ where: { requestToken: token }, select: { logoFileId: true, requestEnabled: true } });
  return logoResponse(org?.requestEnabled ? org.logoFileId : null);
}
