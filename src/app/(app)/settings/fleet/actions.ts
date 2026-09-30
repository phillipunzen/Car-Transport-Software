"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { str } from "@/lib/format";
import { PLATE_KIND } from "@/lib/fleet";

const dateOrNull = (v: FormDataEntryValue | null) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null;
};

export async function saveLicense(formData: FormData) {
  const ctx = await requireOffice();
  const m = await db.membership.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  if (!m) return;
  await db.membership.update({
    where: { id: m.id },
    data: {
      licenseClasses: str(formData.get("licenseClasses")),
      licenseExpiry: dateOrNull(formData.get("licenseExpiry")),
      licenseCheckedAt: formData.get("checkedToday") === "1" ? new Date() : (dateOrNull(formData.get("licenseCheckedAt")) ?? m.licenseCheckedAt),
    },
  });
  revalidatePath("/settings/fleet");
}

export async function savePlate(formData: FormData) {
  const ctx = await requireOffice();
  const plate = str(formData.get("plate"))?.toUpperCase();
  if (!plate) return;
  const kind = String(formData.get("kind"));
  const data = { plate, kind: PLATE_KIND[kind] ? kind : "RED", validUntil: dateOrNull(formData.get("validUntil")), notes: str(formData.get("notes")) };
  const id = str(formData.get("id"));
  if (id) await db.tradePlate.updateMany({ where: { id, organizationId: ctx.orgId }, data });
  else await db.tradePlate.create({ data: { ...data, organizationId: ctx.orgId } });
  revalidatePath("/settings/fleet");
}

export async function togglePlate(formData: FormData) {
  const ctx = await requireOffice();
  const plate = await db.tradePlate.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  if (!plate) return;
  await db.tradePlate.update({ where: { id: plate.id }, data: { active: !plate.active } });
  revalidatePath("/settings/fleet");
}
