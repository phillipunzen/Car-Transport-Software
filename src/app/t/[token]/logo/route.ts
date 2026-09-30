import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logoResponse, validToken } from "@/lib/public";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return new NextResponse("Not found", { status: 404 });
  const order = await db.order.findUnique({ where: { trackingToken: token }, select: { organization: { select: { logoFileId: true } } } });
  return logoResponse(order?.organization.logoFileId);
}
