import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { memberOrgFor, protocolPdf } from "@/lib/pdf/load";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id, type } = await params;
  const order = await db.order.findUnique({ where: { id }, select: { organizationId: true } });
  const orgId = await memberOrgFor(session.user.id, order?.organizationId);
  if (!orgId) return new NextResponse("Not found", { status: 404 });
  const result = await protocolPdf(orgId, id, type === "delivery" ? "DELIVERY" : "PICKUP");
  if (!result) return new NextResponse("Protokoll existiert noch nicht", { status: 404 });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${result.filename}"`, "Cache-Control": "no-store" },
  });
}
