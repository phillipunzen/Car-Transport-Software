import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { customerName, orderNo } from "@/lib/format";
import { memberOrgFor } from "@/lib/pdf/load";

export const runtime = "nodejs";

/** Fahrtenbuch eines Fahrzeugs: alle Überführungen mit Kilometerständen (CSV für Excel). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  const orgId = await memberOrgFor(session.user.id, vehicle?.organizationId, { office: true });
  if (!vehicle || !orgId) return new NextResponse("Not found", { status: 404 });
  const orders = await db.order.findMany({
    where: { vehicleId: id, organizationId: orgId, status: { not: "CANCELLED" } },
    include: { protocols: { include: { performedBy: true } }, customer: true, assignedTo: true },
    orderBy: { pickupDate: "asc" },
  });
  const d = (x: Date | null | undefined) => (x ? x.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }) : "");
  const q = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["Abfahrt", "Ankunft", "Auftrag", "Von", "Nach", "km Start", "km Ende", "gefahren km", "Tank Start %", "Tank Ende %", "Fahrer", "Zweck", "Auftraggeber"].join(";")];
  for (const o of orders) {
    const p = o.protocols.find((x) => x.type === "PICKUP");
    const dl = o.protocols.find((x) => x.type === "DELIVERY");
    const driven = p?.mileage != null && dl?.mileage != null ? String(dl.mileage - p.mileage) : "";
    rows.push(
      [
        d(p?.performedAt ?? o.pickupDate),
        d(dl?.performedAt),
        orderNo(o.number),
        q([o.pickupStreet, o.pickupZip, o.pickupCity].filter(Boolean).join(" ")),
        q([o.deliveryStreet, o.deliveryZip, o.deliveryCity].filter(Boolean).join(" ")),
        p?.mileage ?? "",
        dl?.mileage ?? "",
        driven,
        p?.fuelLevel ?? "",
        dl?.fuelLevel ?? "",
        q(dl?.performedBy?.name ?? p?.performedBy?.name ?? o.assignedTo?.name),
        q("Fahrzeugüberführung"),
        q(customerName(o.customer)),
      ].join(";"),
    );
  }
  const name = (vehicle.licensePlate ?? vehicle.vin ?? "Fahrzeug").replace(/[^A-Za-z0-9-]/g, "_");
  return new NextResponse("﻿" + rows.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Fahrtenbuch_${name}.csv"` },
  });
}
