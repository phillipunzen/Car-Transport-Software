import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type VehicleFields = {
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  firstRegistration: string | null;
  vehicleType: string | null;
};

const FIELDS = ["licensePlate", "vin", "make", "model", "color", "firstRegistration", "vehicleType"] as const;

/**
 * Pflegt die Fahrzeug-Stammdaten anhand eines Auftrags:
 * Zuordnung zuerst über die FIN, sonst über das Kennzeichen. Vorhandene Angaben
 * werden nur ergänzt bzw. aktualisiert, nie durch leere Werte überschrieben.
 * Liefert die Fahrzeug-ID (oder null, wenn weder FIN noch Kennzeichen bekannt sind).
 */
export async function syncVehicle(
  orgId: string,
  customerId: string,
  data: VehicleFields,
  preferredId?: string | null,
): Promise<string | null> {
  if (!data.vin && !data.licensePlate) return preferredId ?? null;

  let existing = preferredId ? await db.vehicle.findFirst({ where: { id: preferredId, organizationId: orgId } }) : null;
  // Ausgewähltes Fahrzeug passt nicht mehr (andere FIN eingetragen) → neu zuordnen
  if (existing?.vin && data.vin && existing.vin !== data.vin) existing = null;
  if (!existing && data.vin) existing = await db.vehicle.findFirst({ where: { organizationId: orgId, vin: data.vin } });
  if (!existing && data.licensePlate) {
    const byPlate = await db.vehicle.findFirst({
      where: { organizationId: orgId, licensePlate: data.licensePlate },
      orderBy: { updatedAt: "desc" },
    });
    // Gleiches Kennzeichen, aber andere FIN → anderes Fahrzeug (Kennzeichen wurde weitergegeben)
    if (byPlate && !(byPlate.vin && data.vin && byPlate.vin !== data.vin)) existing = byPlate;
  }

  const update: Prisma.VehicleUncheckedUpdateInput = { customerId };
  for (const k of FIELDS) if (data[k]) update[k] = data[k];

  if (existing) {
    await db.vehicle.update({ where: { id: existing.id }, data: update });
    return existing.id;
  }
  const created = await db.vehicle.create({
    data: { organizationId: orgId, customerId, ...Object.fromEntries(FIELDS.map((k) => [k, data[k]])) },
  });
  return created.id;
}

export type VehicleOption = {
  id: string;
  customerId: string | null;
  licensePlate: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  firstRegistration: string | null;
  vehicleType: string | null;
};

export async function vehicleOptions(orgId: string): Promise<VehicleOption[]> {
  return db.vehicle.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      customerId: true,
      licensePlate: true,
      vin: true,
      make: true,
      model: true,
      color: true,
      firstRegistration: true,
      vehicleType: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
}
