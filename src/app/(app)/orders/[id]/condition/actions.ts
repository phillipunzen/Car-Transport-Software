"use server";

import { revalidatePath } from "next/cache";
import type { Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { deleteFile, saveUpload } from "@/lib/files";
import { DAMAGE_AREAS, DAMAGE_SEVERITY, DAMAGE_TYPES, PHOTO_CATEGORIES } from "@/lib/labels";
import { str } from "@/lib/format";
import { logEvent } from "../../actions";

const stageOf = (v: FormDataEntryValue | null): Stage => (v === "DELIVERY" ? "DELIVERY" : "PICKUP");

async function orderFor(orderId: string) {
  const ctx = await requireCtx();
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } });
  if (!order) throw new Error("Auftrag nicht gefunden");
  return { ctx, order };
}

export async function uploadPhotos(formData: FormData): Promise<{ error?: string; count?: number }> {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const stage = stageOf(formData.get("stage"));
  const category = String(formData.get("category") ?? "OTHER");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    for (const file of files) {
      const { record } = await saveUpload(ctx.orgId, ctx.user.id, file);
      await db.photo.create({
        data: { orderId: order.id, fileId: record.id, stage, category: PHOTO_CATEGORIES[category] ? category : "OTHER" },
      });
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  await logEvent(order.id, ctx, `${files.length} Foto(s) hinzugefügt`);
  revalidatePath(`/orders/${order.id}`, "layout");
  return { count: files.length };
}

export async function updatePhoto(formData: FormData) {
  const { order } = await orderFor(String(formData.get("orderId")));
  const category = String(formData.get("category"));
  await db.photo.updateMany({
    where: { id: String(formData.get("photoId")), orderId: order.id },
    data: { category: PHOTO_CATEGORIES[category] ? category : "OTHER", caption: str(formData.get("caption")), stage: stageOf(formData.get("stage")) },
  });
  revalidatePath(`/orders/${order.id}/condition`);
}

export async function deletePhoto(formData: FormData) {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const photo = await db.photo.findFirst({ where: { id: String(formData.get("photoId")), orderId: order.id } });
  if (!photo) return;
  await deleteFile(ctx.orgId, photo.fileId);
  revalidatePath(`/orders/${order.id}`, "layout");
}

export async function addDamage(formData: FormData): Promise<{ error?: string }> {
  const { ctx, order } = await orderFor(String(formData.get("orderId")));
  const area = String(formData.get("area"));
  const type = String(formData.get("type"));
  const severity = String(formData.get("severity"));
  if (!DAMAGE_AREAS[area]) return { error: "Bitte eine Position wählen." };
  const stage = stageOf(formData.get("stage"));
  let photoId: string | null = null;
  const file = formData.get("photo");
  try {
    if (file instanceof File && file.size > 0) {
      const { record } = await saveUpload(ctx.orgId, ctx.user.id, file);
      const photo = await db.photo.create({
        data: { orderId: order.id, fileId: record.id, stage, category: "DAMAGE", caption: DAMAGE_AREAS[area] },
      });
      photoId = photo.id;
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db.damage.create({
    data: {
      orderId: order.id,
      stage,
      area,
      type: DAMAGE_TYPES[type] ? type : "OTHER",
      severity: DAMAGE_SEVERITY[severity] ? severity : "MINOR",
      description: str(formData.get("description")),
      photoId,
    },
  });
  await logEvent(order.id, ctx, `Schaden erfasst: ${DAMAGE_AREAS[area]} (${DAMAGE_TYPES[type] ?? type})`);
  revalidatePath(`/orders/${order.id}`, "layout");
  return {};
}

export async function deleteDamage(formData: FormData) {
  const { order } = await orderFor(String(formData.get("orderId")));
  await db.damage.deleteMany({ where: { id: String(formData.get("damageId")), orderId: order.id } });
  revalidatePath(`/orders/${order.id}`, "layout");
}
