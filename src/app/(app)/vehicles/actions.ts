"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { str } from "@/lib/format";
import type { FormState } from "@/components/action-form";

async function vehicleData(orgId: string, formData: FormData) {
  const customerId = str(formData.get("customerId"));
  if (customerId && !(await db.customer.findFirst({ where: { id: customerId, organizationId: orgId } }))) {
    throw new Error("Ungültiger Kunde");
  }
  return {
    customerId,
    licensePlate: str(formData.get("licensePlate"))?.toUpperCase() ?? null,
    vin: str(formData.get("vin"))?.replace(/\s/g, "").toUpperCase() ?? null,
    make: str(formData.get("make")),
    model: str(formData.get("model")),
    color: str(formData.get("color")),
    firstRegistration: str(formData.get("firstRegistration")),
    vehicleType: str(formData.get("vehicleType")),
    notes: str(formData.get("notes")),
  };
}

async function checkDuplicate(orgId: string, vin: string | null, ignoreId?: string) {
  if (!vin) return null;
  const dup = await db.vehicle.findFirst({ where: { organizationId: orgId, vin, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
  return dup ? "Ein Fahrzeug mit dieser FIN ist bereits im Bestand." : null;
}

export async function createVehicle(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  let data;
  try {
    data = await vehicleData(ctx.orgId, formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!data.vin && !data.licensePlate) return { error: "Bitte mindestens Kennzeichen oder FIN angeben." };
  const dup = await checkDuplicate(ctx.orgId, data.vin);
  if (dup) return { error: dup };
  const vehicle = await db.vehicle.create({ data: { ...data, organizationId: ctx.orgId } });
  redirect(`/vehicles/${vehicle.id}`);
}

export async function updateVehicle(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const id = String(formData.get("id"));
  let data;
  try {
    data = await vehicleData(ctx.orgId, formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!data.vin && !data.licensePlate) return { error: "Bitte mindestens Kennzeichen oder FIN angeben." };
  const dup = await checkDuplicate(ctx.orgId, data.vin, id);
  if (dup) return { error: dup };
  const res = await db.vehicle.updateMany({ where: { id, organizationId: ctx.orgId }, data });
  if (!res.count) return { error: "Fahrzeug nicht gefunden." };
  revalidatePath(`/vehicles/${id}`);
  return { ok: "Gespeichert." };
}

export async function deleteVehicle(formData: FormData) {
  const ctx = await requireCtx();
  const id = String(formData.get("id"));
  // Aufträge behalten ihre Fahrzeugdaten; nur die Verknüpfung entfällt
  await db.vehicle.deleteMany({ where: { id, organizationId: ctx.orgId } });
  redirect("/vehicles");
}
