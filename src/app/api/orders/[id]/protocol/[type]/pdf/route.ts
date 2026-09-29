import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { orderNo } from "@/lib/format";
import { renderProtocolPdf } from "@/lib/pdf/protocol";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id, type: rawType } = await params;
  const type = rawType === "delivery" ? "DELIVERY" : "PICKUP";
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      organization: true,
      protocols: { include: { performedBy: true } },
      damages: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return new NextResponse("Not found", { status: 404 });
  const member = await db.membership.findFirst({ where: { userId: session.user.id, organizationId: order.organizationId } });
  if (!member) return new NextResponse("Not found", { status: 404 });
  const protocol = order.protocols.find((p) => p.type === type);
  if (!protocol) return new NextResponse("Protokoll existiert noch nicht", { status: 404 });

  const pdf = await renderProtocolPdf({
    org: order.organization,
    order,
    protocol,
    damages: order.damages.filter((d) => d.stage === type),
    photos: order.photos.filter((p) => p.stage === type),
    pickupDamages: type === "DELIVERY" ? order.damages.filter((d) => d.stage === "PICKUP") : undefined,
  });
  const name = `${type === "PICKUP" ? "Abholprotokoll" : "Uebergabeprotokoll"}_${orderNo(order.number)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
