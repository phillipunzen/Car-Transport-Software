import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/format";
import { renderSettlementPdf } from "@/lib/pdf/settlement";

export const runtime = "nodejs";

/** Abrechnung als PDF – für das Büro und für den betroffenen Fahrer selbst. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const s = await db.driverSettlement.findUnique({
    where: { id },
    include: { organization: true, orders: { include: { protocols: true }, orderBy: { pickupDate: "asc" } }, expenses: { include: { order: { select: { number: true } } } } },
  });
  if (!s) return new NextResponse("Not found", { status: 404 });
  const m = await db.membership.findFirst({ where: { userId: session.user.id, organizationId: s.organizationId } });
  if (!m || (m.role === "DRIVER" && s.userId !== session.user.id)) return new NextResponse("Not found", { status: 404 });
  const pdf = await renderSettlementPdf(s.organization, s, (o) => toNumber(o.driverPay));
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Abrechnung_${s.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
