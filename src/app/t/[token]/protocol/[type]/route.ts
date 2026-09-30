import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { protocolPdf } from "@/lib/pdf/load";
import { validToken } from "@/lib/public";

export const runtime = "nodejs";

/** Abgeschlossene Protokolle über den Status-Link herunterladen. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; type: string }> }) {
  const { token, type } = await params;
  const kind = type === "delivery" ? "DELIVERY" : type === "pickup" ? "PICKUP" : null;
  if (!kind || !validToken(token)) return new NextResponse("Not found", { status: 404 });
  const order = await db.order.findUnique({ where: { trackingToken: token }, select: { id: true, organizationId: true, protocols: { where: { type: kind }, select: { completedAt: true } } } });
  if (!order?.protocols[0]?.completedAt) return new NextResponse("Not found", { status: 404 });
  const result = await protocolPdf(order.organizationId, order.id, kind);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
