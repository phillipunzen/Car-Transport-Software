import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildIcs, type IcsEvent } from "@/lib/calendar";
import { customerName, orderNo } from "@/lib/format";
import { appUrl } from "@/lib/mail";
import { validToken } from "@/lib/public";
import { ORDER_STATUS, TRANSPORT_MODE } from "@/lib/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kalender-Abo (iCal/ICS) für iPhone, Google, Outlook: /api/calendar/<token>.ics[?scope=all]
 * Standard: eigene Touren; scope=all: alle Touren der Firmen, in denen der Benutzer Mitglied ist.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/i, "");
  if (!validToken(token)) return new NextResponse("Not found", { status: 404 });
  const user = await db.user.findUnique({ where: { calendarToken: token }, include: { memberships: { include: { organization: true } } } });
  if (!user) return new NextResponse("Not found", { status: 404 });
  const all = new URL(req.url).searchParams.get("scope") === "all";

  const orgIds = user.memberships.map((m) => m.organizationId);
  const from = new Date(Date.now() - 90 * 86400000);
  const to = new Date(Date.now() + 400 * 86400000);
  const where: Prisma.OrderWhereInput = {
    organizationId: { in: orgIds },
    ...(all ? {} : { assignedToId: user.id }),
    OR: [{ pickupDate: { gte: from, lte: to } }, { pickupDate: null, deliveryDate: { gte: from, lte: to } }],
  };
  const orders = await db.order.findMany({ where, include: { customer: true, assignedTo: true, organization: true }, take: 2000 });
  const multiOrg = user.memberships.length > 1;
  const addr = (street: string | null, zip: string | null, city: string | null) => [street, [zip, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const events: IcsEvent[] = orders.map((o) => {
    const start = o.pickupDate ?? o.deliveryDate!;
    const planned = o.durationMinutes ? o.durationMinutes + 30 : 180; // Fahrzeit + Übergaben
    const end = o.pickupDate && o.deliveryDate && o.deliveryDate > o.pickupDate ? o.deliveryDate : new Date(start.getTime() + planned * 60000);
    const vehicle = [[o.make, o.model].filter(Boolean).join(" "), o.licensePlate].filter(Boolean).join(" · ");
    const who = all && o.assignedTo ? `[${o.assignedTo.name ?? o.assignedTo.email}] ` : all ? "[offen] " : "";
    const pickupAddr = addr(o.pickupStreet, o.pickupZip, o.pickupCity);
    const deliveryAddr = addr(o.deliveryStreet, o.deliveryZip, o.deliveryCity);
    const description = [
      `Auftrag ${orderNo(o.number)} – ${ORDER_STATUS[o.status].label}${multiOrg ? ` (${o.organization.companyName ?? o.organization.name})` : ""}`,
      `Kunde: ${customerName(o.customer)}`,
      vehicle && `Fahrzeug: ${vehicle}`,
      `Art: ${TRANSPORT_MODE[o.transportMode]}`,
      "",
      `Abholung: ${pickupAddr || o.pickupCity || "–"}`,
      [o.pickupContact, o.pickupPhone].filter(Boolean).join(" · "),
      "",
      `Ziel: ${deliveryAddr || o.deliveryCity || "–"}`,
      [o.deliveryContact, o.deliveryPhone].filter(Boolean).join(" · "),
      o.notes ? `\nHinweise: ${o.notes}` : null,
      `\n${appUrl()}/orders/${o.id}`,
    ]
      .filter((l) => l !== null && l !== undefined)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
    return {
      uid: `${o.id}@ueberfuehrung`,
      start,
      end,
      summary: `${who}${orderNo(o.number)} ${o.pickupCity ?? "?"} → ${o.deliveryCity ?? "?"}${vehicle ? ` · ${vehicle}` : ""}`,
      location: pickupAddr || undefined,
      description,
      url: `${appUrl()}/orders/${o.id}`,
      updated: o.updatedAt,
      cancelled: o.status === "CANCELLED",
    };
  });

  const name = all ? "Überführungen – alle Touren" : `Überführungen – ${user.name ?? "meine Touren"}`;
  return new NextResponse(buildIcs(name, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="touren${all ? "-alle" : ""}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
