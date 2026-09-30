"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOffice } from "@/lib/permissions";
import { customerName, str } from "@/lib/format";

/** Strecke eines Auftrags als Vorlage speichern (für wiederkehrende Überführungen). */
export async function saveAsTemplate(formData: FormData) {
  const ctx = await requireOffice();
  const o = await db.order.findFirst({ where: { id: String(formData.get("orderId")), organizationId: ctx.orgId }, include: { customer: true } });
  if (!o) throw new Error("Auftrag nicht gefunden");
  const name = str(formData.get("name")) ?? `${o.pickupCity ?? "?"} → ${o.deliveryCity ?? "?"} (${customerName(o.customer)})`;
  await db.routeTemplate.create({
    data: {
      organizationId: ctx.orgId,
      name: name.slice(0, 120),
      customerId: o.customerId,
      transportMode: o.transportMode,
      pickupName: o.pickupName,
      pickupStreet: o.pickupStreet,
      pickupZip: o.pickupZip,
      pickupCity: o.pickupCity,
      pickupContact: o.pickupContact,
      pickupPhone: o.pickupPhone,
      deliveryName: o.deliveryName,
      deliveryStreet: o.deliveryStreet,
      deliveryZip: o.deliveryZip,
      deliveryCity: o.deliveryCity,
      deliveryContact: o.deliveryContact,
      deliveryPhone: o.deliveryPhone,
      distanceKm: o.distanceKm,
      durationMinutes: o.durationMinutes,
      pricingType: o.pricingType,
      price: o.price,
      pricePerKm: o.pricePerKm,
      returnType: o.returnType,
      returnFlat: o.returnFlat,
      returnPerKm: o.returnPerKm,
      notes: o.notes,
    },
  });
  redirect("/orders/templates?saved=1");
}

export async function renameTemplate(formData: FormData) {
  const ctx = await requireOffice();
  const name = str(formData.get("name"));
  if (!name) return;
  await db.routeTemplate.updateMany({ where: { id: String(formData.get("id")), organizationId: ctx.orgId }, data: { name: name.slice(0, 120) } });
  revalidatePath("/orders/templates");
}

export async function deleteTemplate(formData: FormData) {
  const ctx = await requireOffice();
  await db.routeTemplate.deleteMany({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  revalidatePath("/orders/templates");
}
