"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStatus, PricingType, TransportMode } from "@prisma/client";
import { db } from "@/lib/db";
import { canManage, nextNumber, requireCtx, type Ctx } from "@/lib/org";
import { decimal, fromDateTimeLocal, str } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/labels";
import { recognitionMode, recognizeVehicle } from "@/lib/recognition";
import { deleteFile, saveUpload } from "@/lib/files";
import type { FormState } from "@/components/action-form";

export async function logEvent(orderId: string, ctx: Ctx, message: string) {
  await db.orderEvent.create({ data: { orderId, message, userName: ctx.user.name ?? ctx.user.email } });
}

async function requireOrder(ctx: Ctx, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, organizationId: ctx.orgId } });
  if (!order) throw new Error("Auftrag nicht gefunden");
  return order;
}

async function orderData(ctx: Ctx, formData: FormData) {
  const assignedToId = str(formData.get("assignedToId"));
  if (assignedToId) {
    const member = await db.membership.findFirst({ where: { userId: assignedToId, organizationId: ctx.orgId } });
    if (!member) throw new Error("Ungültiger Fahrer");
  }
  const pricingType: PricingType = formData.get("pricingType") === "PER_KM" ? "PER_KM" : "FLAT";
  const mode = String(formData.get("transportMode"));
  return {
    transportMode: (["DRIVEN", "TRAILER", "TRUCK"].includes(mode) ? mode : "DRIVEN") as TransportMode,
    reference: str(formData.get("reference")),
    pickupName: str(formData.get("pickupName")),
    pickupStreet: str(formData.get("pickupStreet")),
    pickupZip: str(formData.get("pickupZip")),
    pickupCity: str(formData.get("pickupCity")),
    pickupContact: str(formData.get("pickupContact")),
    pickupPhone: str(formData.get("pickupPhone")),
    pickupDate: fromDateTimeLocal(str(formData.get("pickupDate"))),
    deliveryName: str(formData.get("deliveryName")),
    deliveryStreet: str(formData.get("deliveryStreet")),
    deliveryZip: str(formData.get("deliveryZip")),
    deliveryCity: str(formData.get("deliveryCity")),
    deliveryContact: str(formData.get("deliveryContact")),
    deliveryPhone: str(formData.get("deliveryPhone")),
    deliveryDate: fromDateTimeLocal(str(formData.get("deliveryDate"))),
    licensePlate: str(formData.get("licensePlate"))?.toUpperCase() ?? null,
    make: str(formData.get("make")),
    model: str(formData.get("model")),
    vin: str(formData.get("vin"))?.replace(/\s/g, "").toUpperCase() ?? null,
    color: str(formData.get("color")),
    firstRegistration: str(formData.get("firstRegistration")),
    vehicleType: str(formData.get("vehicleType")),
    distanceKm: decimal(formData.get("distanceKm")),
    pricingType,
    price: decimal(formData.get("price")),
    pricePerKm: decimal(formData.get("pricePerKm")),
    notes: str(formData.get("notes")),
    assignedToId,
  };
}

export async function createOrder(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const customerId = str(formData.get("customerId"));
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.orgId } }) : null;
  if (!customer) return { error: "Bitte wähle einen Kunden aus." };
  let data;
  try {
    data = await orderData(ctx, formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const number = await nextNumber(ctx.orgId, "nextOrderNumber");
  const order = await db.order.create({
    data: {
      ...data,
      organizationId: ctx.orgId,
      customerId: customer.id,
      number,
      status: data.pickupDate ? "PLANNED" : "DRAFT",
      createdById: ctx.user.id,
    },
  });
  await logEvent(order.id, ctx, "Auftrag angelegt");
  redirect(`/orders/${order.id}`);
}

export async function updateOrder(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const id = String(formData.get("id"));
  await requireOrder(ctx, id);
  const customerId = str(formData.get("customerId"));
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.orgId } }) : null;
  if (!customer) return { error: "Bitte wähle einen Kunden aus." };
  try {
    await db.order.update({ where: { id }, data: { ...(await orderData(ctx, formData)), customerId: customer.id } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  await logEvent(id, ctx, "Auftragsdaten bearbeitet");
  redirect(`/orders/${id}`);
}

export async function setOrderStatus(formData: FormData) {
  const ctx = await requireCtx();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as OrderStatus;
  if (!ORDER_STATUS[status]) throw new Error("Ungültiger Status");
  await requireOrder(ctx, id);
  await db.order.update({ where: { id }, data: { status } });
  await logEvent(id, ctx, `Status geändert: ${ORDER_STATUS[status].label}`);
  revalidatePath(`/orders/${id}`);
}

export async function deleteOrder(formData: FormData) {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) throw new Error("Nur Administratoren können Aufträge löschen.");
  const id = String(formData.get("id"));
  const order = await db.order.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { photos: true, expenses: true, invoices: { where: { status: { not: "DRAFT" } } } },
  });
  if (!order) return;
  if (order.invoices.length) throw new Error("Aufträge mit festgeschriebenen Rechnungen können nicht gelöscht werden.");
  const fileIds = [...order.photos.map((p) => p.fileId), ...order.expenses.map((e) => e.fileId).filter((f): f is string => !!f)];
  await db.invoice.deleteMany({ where: { orderId: id, status: "DRAFT" } });
  await db.order.delete({ where: { id } });
  for (const fileId of fileIds) await deleteFile(ctx.orgId, fileId);
  redirect("/orders");
}

export type VehicleScanResult = {
  error?: string;
  data?: {
    licensePlate: string | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    color: string | null;
    firstRegistration: string | null;
    mileage: number | null;
    notes: string | null;
  };
};

/** Liest Kennzeichen, Marke, Modell, FIN usw. aus Fotos aus (KI oder lokale OCR). */
export async function scanVehicle(formData: FormData): Promise<VehicleScanResult> {
  const ctx = await requireCtx();
  if (recognitionMode() === "off") return { error: "Die automatische Erkennung ist deaktiviert." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
  if (files.length === 0) return { error: "Bitte mindestens ein Foto auswählen." };
  const orderId = str(formData.get("orderId"));
  if (orderId) await requireOrder(ctx, orderId);

  try {
    const inputs = [];
    for (const file of files) {
      if (orderId) {
        const { record, data } = await saveUpload(ctx.orgId, ctx.user.id, file);
        await db.photo.create({ data: { orderId, fileId: record.id, stage: "PICKUP", category: "OTHER", caption: "Fahrzeugerkennung" } });
        inputs.push({ data, mimeType: record.mimeType });
      } else {
        inputs.push({ data: Buffer.from(await file.arrayBuffer()), mimeType: file.type });
      }
    }
    const data = await recognizeVehicle(inputs);
    if (orderId) revalidatePath(`/orders/${orderId}`);
    return { data };
  } catch (e) {
    console.error("Fahrzeugerkennung fehlgeschlagen", e);
    return { error: "Die Erkennung ist fehlgeschlagen. Bitte Daten manuell eintragen." };
  }
}
