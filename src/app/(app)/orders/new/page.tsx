import Link from "next/link";
import { db } from "@/lib/db";

import { customerOptions, memberOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { effectiveConditions } from "@/lib/pricing";
import { OrderForm } from "@/components/order-form";
import { tradePlateOptions } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { createOrder } from "../actions";
import { requireOffice } from "@/lib/permissions";

export const metadata = { title: "Neuer Auftrag" };

const COPY_FIELDS = [
  "transportMode",
  "pickupName",
  "pickupStreet",
  "pickupZip",
  "pickupCity",
  "pickupContact",
  "pickupPhone",
  "deliveryName",
  "deliveryStreet",
  "deliveryZip",
  "deliveryCity",
  "deliveryContact",
  "deliveryPhone",
  "distanceKm",
  "durationMinutes",
  "pricingType",
  "price",
  "pricePerKm",
  "returnType",
  "returnFlat",
  "returnPerKm",
  "notes",
] as const;

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string; copyFrom?: string; template?: string }>;
}) {
  const ctx = await requireOffice();
  const { customerId: customerParam, vehicleId, copyFrom, template } = await searchParams;
  const [customers, members, vehicles, templates] = await Promise.all([
    customerOptions(ctx.orgId),
    memberOptions(ctx.orgId),
    vehicleOptions(ctx.orgId),
    db.routeTemplate.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);
  // Vorlage oder Kopie eines Auftrags: Strecke, Kontakte und Preise übernehmen (ohne Termine und Fahrzeug)
  const source = copyFrom
    ? await db.order.findFirst({ where: { id: copyFrom, organizationId: ctx.orgId } })
    : template
      ? templates.find((t) => t.id === template) ?? null
      : null;
  const customerId = customerParam ?? source?.customerId ?? undefined;
  const values: Record<string, string> = { assignedToId: ctx.user.id };
  // Konditionen: Kunde (falls vorgewählt) vor Firmenstandard
  const conditions = customers.find((c) => c.id === customerId)?.conditions ?? effectiveConditions(ctx.org, null);
  if (customerId) values.customerId = customerId;
  const fmt = (n: number | null) => (n === null ? undefined : String(n).replace(".", ","));
  if (fmt(conditions.pricePerKm)) values.pricePerKm = fmt(conditions.pricePerKm)!;
  values.returnType = conditions.returnType;
  if (fmt(conditions.returnFlat)) values.returnFlat = fmt(conditions.returnFlat)!;
  if (fmt(conditions.returnPerKm)) values.returnPerKm = fmt(conditions.returnPerKm)!;

  if (source) {
    for (const k of COPY_FIELDS) {
      const v = source[k];
      if (v !== null && v !== undefined && v !== "") values[k] = typeof v === "object" ? String(v).replace(".", ",") : String(v);
    }
  }

  // Aus der Fahrzeugübersicht: Fahrzeug direkt vorbelegen
  if (vehicleId) {
    const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, organizationId: ctx.orgId } });
    if (vehicle) {
      values.vehicleId = vehicle.id;
      for (const k of ["licensePlate", "vin", "make", "model", "color", "firstRegistration", "vehicleType"] as const) {
        if (vehicle[k]) values[k] = vehicle[k]!;
      }
      if (!values.customerId && vehicle.customerId) values.customerId = vehicle.customerId;
    }
  }

  return (
    <>
      <PageHeader
        title="Neuer Auftrag"
        subtitle="Nur der Kunde ist Pflicht – alles andere kann auch später vor Ort ergänzt werden."
        back={{ href: "/orders", label: "Aufträge" }}
      />
      {templates.length > 0 && !source && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-medium text-slate-600">Aus Vorlage:</span>
          {templates.slice(0, 12).map((t) => (
            <Link key={t.id} href={`/orders/new?template=${t.id}`} className="rounded-full bg-slate-100 px-3 py-1 hover:bg-brand-50 hover:text-brand-700">
              {t.name}
            </Link>
          ))}
          <Link href="/orders/templates" className="ml-auto text-xs text-slate-500 hover:text-brand-600">
            Vorlagen verwalten
          </Link>
        </div>
      )}
      {source && (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          {copyFrom ? "Kopie eines bestehenden Auftrags" : `Vorlage „${"name" in source ? source.name : ""}“`} – Strecke, Kontakte und Preise sind übernommen. Termin und Fahrzeug bitte neu eintragen.
        </div>
      )}
      <OrderForm
        action={createOrder}
        customers={customers}
        members={members}
        vehicles={vehicles}
        values={values}
        driverPayModule={ctx.org.moduleDriverPay}
        tradePlates={await tradePlateOptions(ctx.org)}
        recognition={recognitionMode()}
        geo={geoEnabled()}
      />
    </>
  );
}
