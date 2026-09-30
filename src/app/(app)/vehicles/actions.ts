"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { type Ctx } from "@/lib/org";
import { str } from "@/lib/format";
import { deleteFile, saveUpload } from "@/lib/files";
import type { FormState } from "@/components/action-form";
import { requireOffice } from "@/lib/permissions";

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

/** Hochgeladene Dokumente (z. B. Fahrzeugschein) am Fahrzeug ablegen. */
async function saveDocuments(ctx: Ctx, vehicleId: string, formData: FormData) {
  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
  for (const file of files) {
    const { record } = await saveUpload(ctx.orgId, ctx.user.id, file);
    await db.vehicleDocument.create({ data: { vehicleId, fileId: record.id, kind: "REGISTRATION" } });
  }
  return files.length;
}

export async function createVehicle(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
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
  try {
    await saveDocuments(ctx, vehicle.id, formData);
  } catch (e) {
    console.error("Fahrzeugdokument konnte nicht gespeichert werden", e);
  }
  redirect(`/vehicles/${vehicle.id}`);
}

export async function updateVehicle(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
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
  let saved = 0;
  try {
    saved = await saveDocuments(ctx, id, formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/vehicles/${id}`);
  return { ok: saved ? `Gespeichert (${saved} Dokument${saved === 1 ? "" : "e"} hinzugefügt).` : "Gespeichert." };
}

export async function deleteVehicle(formData: FormData) {
  const ctx = await requireOffice();
  const id = String(formData.get("id"));
  const vehicle = await db.vehicle.findFirst({ where: { id, organizationId: ctx.orgId }, include: { documents: true } });
  if (!vehicle) redirect("/vehicles");
  // Aufträge behalten ihre Fahrzeugdaten; nur die Verknüpfung entfällt
  await db.vehicle.delete({ where: { id: vehicle.id } });
  for (const doc of vehicle.documents) await deleteFile(ctx.orgId, doc.fileId);
  redirect("/vehicles");
}

export async function deleteVehicleDocument(formData: FormData) {
  const ctx = await requireOffice();
  const doc = await db.vehicleDocument.findFirst({
    where: { id: String(formData.get("documentId")), vehicle: { organizationId: ctx.orgId } },
  });
  if (!doc) return;
  await deleteFile(ctx.orgId, doc.fileId);
  revalidatePath(`/vehicles/${doc.vehicleId}`);
}
