"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { nextNumber, type Ctx } from "@/lib/org";
import { syncVehicle } from "@/lib/vehicles";
import { fromDateTimeLocal } from "@/lib/format";
import { logEvent } from "../orders/actions";
import { requireOffice } from "@/lib/permissions";

async function requireInquiry(ctx: Ctx, id: string) {
  const inquiry = await db.inquiry.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!inquiry) throw new Error("Anfrage nicht gefunden");
  return inquiry;
}

/** Kunde zur Anfrage: vorhandenen Kunden mit gleicher E-Mail verwenden, sonst neu anlegen. */
async function customerFor(ctx: Ctx, inquiry: Awaited<ReturnType<typeof requireInquiry>>) {
  if (inquiry.customerId) {
    const known = await db.customer.findFirst({ where: { id: inquiry.customerId, organizationId: ctx.orgId } });
    if (known) return known;
  }
  const existing = await db.customer.findFirst({ where: { organizationId: ctx.orgId, email: inquiry.email } });
  if (existing) return existing;
  const [firstName, ...rest] = inquiry.contactName.split(/\s+/);
  const number = await nextNumber(ctx.orgId, "nextCustomerNumber");
  return db.customer.create({
    data: {
      organizationId: ctx.orgId,
      number,
      type: inquiry.companyName ? "COMPANY" : "PRIVATE",
      companyName: inquiry.companyName,
      firstName: rest.length ? firstName : null,
      lastName: rest.length ? rest.join(" ") : firstName,
      email: inquiry.email,
      phone: inquiry.phone,
    },
  });
}

/** Weiter zum Angebot (Eckdaten werden im Angebotsformular vorbelegt). */
export async function inquiryToQuote(formData: FormData) {
  const ctx = await requireOffice();
  const inquiry = await requireInquiry(ctx, String(formData.get("id")));
  if (inquiry.quoteId) redirect(`/quotes/${inquiry.quoteId}`);
  const customer = await customerFor(ctx, inquiry);
  redirect(`/quotes/new?customerId=${customer.id}&inquiryId=${inquiry.id}`);
}

/** Direkt als Auftrag übernehmen (ohne Angebot). */
export async function inquiryToOrder(formData: FormData) {
  const ctx = await requireOffice();
  const inquiry = await requireInquiry(ctx, String(formData.get("id")));
  if (inquiry.orderId) redirect(`/orders/${inquiry.orderId}`);
  const customer = await customerFor(ctx, inquiry);
  // Wunschtermin (nur Datum, deutsche Zeit) → 9:00 Uhr
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? fromDateTimeLocal(`${s}T09:00`) : null);
  const vehicle = { licensePlate: inquiry.licensePlate, make: inquiry.make, model: inquiry.model, vin: inquiry.vin, color: null, firstRegistration: null, vehicleType: null };
  const vehicleId = inquiry.licensePlate || inquiry.vin || inquiry.make ? await syncVehicle(ctx.orgId, customer.id, vehicle, null) : null;
  const number = await nextNumber(ctx.orgId, "nextOrderNumber");
  const pickupDate = date(inquiry.pickupDate);
  const order = await db.order.create({
    data: {
      organizationId: ctx.orgId,
      customerId: customer.id,
      number,
      status: pickupDate ? "PLANNED" : "DRAFT",
      createdById: ctx.user.id,
      transportMode: inquiry.transportMode,
      pickupName: inquiry.companyName ?? inquiry.contactName,
      pickupStreet: inquiry.pickupStreet,
      pickupZip: inquiry.pickupZip,
      pickupCity: inquiry.pickupCity,
      pickupContact: inquiry.contactName,
      pickupPhone: inquiry.phone,
      pickupDate,
      deliveryStreet: inquiry.deliveryStreet,
      deliveryZip: inquiry.deliveryZip,
      deliveryCity: inquiry.deliveryCity,
      deliveryDate: date(inquiry.deliveryDate),
      licensePlate: inquiry.licensePlate,
      make: inquiry.make,
      model: inquiry.model,
      vin: inquiry.vin,
      vehicleId,
      notes: inquiry.notes,
      returnType: customer.returnType || ctx.org.defaultReturnType,
    },
  });
  await db.inquiry.update({ where: { id: inquiry.id }, data: { status: "ACCEPTED", orderId: order.id } });
  await logEvent(order.id, ctx, "Auftrag aus Online-Anfrage übernommen");
  redirect(`/orders/${order.id}/edit`);
}

export async function setInquiryStatus(formData: FormData) {
  const ctx = await requireOffice();
  const inquiry = await requireInquiry(ctx, String(formData.get("id")));
  const status = formData.get("status") === "REJECTED" ? "REJECTED" : "NEW";
  await db.inquiry.update({ where: { id: inquiry.id }, data: { status } });
  revalidatePath("/inquiries");
  revalidatePath(`/inquiries/${inquiry.id}`);
}

export async function deleteInquiry(formData: FormData) {
  const ctx = await requireOffice();
  const inquiry = await requireInquiry(ctx, String(formData.get("id")));
  await db.inquiry.delete({ where: { id: inquiry.id } });
  redirect("/inquiries");
}
