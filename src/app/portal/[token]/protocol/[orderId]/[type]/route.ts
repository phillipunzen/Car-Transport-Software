import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { protocolPdf } from "@/lib/pdf/load";
import { portalCustomer } from "@/lib/portal";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; orderId: string; type: string }> }) {
  const { token, orderId, type } = await params;
  const kind = type === "delivery" ? "DELIVERY" : type === "pickup" ? "PICKUP" : null;
  const customer = await portalCustomer(token);
  if (!customer || !kind) return new NextResponse("Not found", { status: 404 });
  const order = await db.order.findFirst({ where: { id: orderId, customerId: customer.id, protocols: { some: { type: kind, completedAt: { not: null } } } }, select: { id: true } });
  if (!order) return new NextResponse("Not found", { status: 404 });
  const result = await protocolPdf(customer.organizationId, order.id, kind);
  if (!result) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
