import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { customerOptions, memberOptions } from "@/lib/queries";
import { recognitionMode } from "@/lib/recognition";
import { geoEnabled } from "@/lib/geo";
import { vehicleOptions } from "@/lib/vehicles";
import { OrderForm } from "@/components/order-form";
import { PageHeader } from "@/components/ui";
import { createOrder } from "../actions";

export const metadata = { title: "Neuer Auftrag" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customerId?: string; vehicleId?: string }> }) {
  const ctx = await requireCtx();
  const { customerId, vehicleId } = await searchParams;
  const [customers, members, vehicles] = await Promise.all([customerOptions(ctx.orgId), memberOptions(ctx.orgId), vehicleOptions(ctx.orgId)]);
  const values: Record<string, string> = { assignedToId: ctx.user.id };
  if (customerId) values.customerId = customerId;
  if (ctx.org.defaultPricePerKm) values.pricePerKm = String(ctx.org.defaultPricePerKm);

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
