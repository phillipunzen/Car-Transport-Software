import { db } from "@/lib/db";

import { customerOptions, memberOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { effectiveConditions } from "@/lib/pricing";
import { OrderForm } from "@/components/order-form";
import { PageHeader } from "@/components/ui";
import { createOrder } from "../actions";
import { requireOffice } from "@/lib/permissions";

export const metadata = { title: "Neuer Auftrag" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string; vehicleId?: string }> }) {
  const ctx = await requireOffice();
  const { customerId, vehicleId } = await searchParams;
  const [customers, members, vehicles] = await Promise.all([customerOptions(ctx.orgId), memberOptions(ctx.orgId), vehicleOptions(ctx.orgId)]);
  const values: Record<string, string> = { assignedToId: ctx.user.id };
  // Konditionen: Kunde (falls vorgewählt) vor Firmenstandard
  const conditions = customers.find((c) => c.id === customerId)?.conditions ?? effectiveConditions(ctx.org, null);
  if (customerId) values.customerId = customerId;
  const fmt = (n: number | null) => (n === null ? undefined : String(n).replace(".", ","));
  if (fmt(conditions.pricePerKm)) values.pricePerKm = fmt(conditions.pricePerKm)!;
  values.returnType = conditions.returnType;
  if (fmt(conditions.returnFlat)) values.returnFlat = fmt(conditions.returnFlat)!;
  if (fmt(conditions.returnPerKm)) values.returnPerKm = fmt(conditions.returnPerKm)!;

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
      <OrderForm
        action={createOrder}
        customers={customers}
        members={members}
        vehicles={vehicles}
        values={values}
        recognition={recognitionMode()}
        geo={geoEnabled()}
      />
    </>
  );
}
