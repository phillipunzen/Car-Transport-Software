"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { nextNumber } from "@/lib/org";
import { decimal, str } from "@/lib/format";
import { RETURN_TYPE } from "@/lib/labels";
import type { FormState } from "@/components/action-form";
import { requireOffice } from "@/lib/permissions";

function customerData(formData: FormData) {
  const type = formData.get("type") === "PRIVATE" ? "PRIVATE" : "COMPANY";
  return {
    type,
    companyName: str(formData.get("companyName")),
    firstName: str(formData.get("firstName")),
    lastName: str(formData.get("lastName")),
    email: str(formData.get("email")),
    phone: str(formData.get("phone")),
    street: str(formData.get("street")),
    zip: str(formData.get("zip")),
    city: str(formData.get("city")),
    country: str(formData.get("country")) ?? "Deutschland",
    vatId: str(formData.get("vatId")),
    notes: str(formData.get("notes")),
    // Konditionen (leer = Firmenstandard)
    pricePerKm: decimal(formData.get("pricePerKm")),
    paymentTermDays: intOrNull(formData.get("paymentTermDays")),
    discountPercent: decimal(formData.get("discountPercent")),
    discountDays: intOrNull(formData.get("discountDays")),
    returnType: RETURN_TYPE[String(formData.get("returnType"))] ? String(formData.get("returnType")) : null,
    returnFlat: decimal(formData.get("returnFlat")),
    returnPerKm: decimal(formData.get("returnPerKm")),
    buyerReference: str(formData.get("buyerReference")),
  } as const;
}

function intOrNull(v: FormDataEntryValue | null) {
  const n = decimal(v);
  return n === null ? null : Math.max(0, Math.round(n));
}

function validate(data: ReturnType<typeof customerData>) {
  if (data.type === "COMPANY" && !data.companyName) return "Bitte gib einen Firmennamen an.";
  if (data.type === "PRIVATE" && !data.lastName) return "Bitte gib einen Nachnamen an.";
  if (data.discountPercent !== null && (data.discountPercent < 0 || data.discountPercent > 20)) return "Skonto bitte zwischen 0 und 20 % angeben.";
  if (data.discountPercent && !data.discountDays) return "Bitte die Skonto-Frist (Tage) angeben.";
}

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
  const data = customerData(formData);
  const error = validate(data);
  if (error) return { error };
  const number = await nextNumber(ctx.orgId, "nextCustomerNumber");
  const customer = await db.customer.create({ data: { ...data, organizationId: ctx.orgId, number } });
  const returnTo = String(formData.get("returnTo") ?? "");
  if (returnTo === "order") redirect(`/orders/new?customerId=${customer.id}`);
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOffice();
  const id = String(formData.get("id"));
  const data = customerData(formData);
  const error = validate(data);
  if (error) return { error };
  const res = await db.customer.updateMany({ where: { id, organizationId: ctx.orgId }, data });
  if (res.count === 0) return { error: "Kunde nicht gefunden." };
  revalidatePath(`/customers/${id}`);
  return { ok: "Gespeichert." };
}

export async function deleteCustomer(formData: FormData) {
  const ctx = await requireOffice();
  const id = String(formData.get("id"));
  const used = await db.order.count({ where: { customerId: id } }) + (await db.invoice.count({ where: { customerId: id } }));
  if (used > 0) throw new Error("Kunde hat Aufträge oder Rechnungen und kann nicht gelöscht werden.");
  await db.customer.deleteMany({ where: { id, organizationId: ctx.orgId } });
  redirect("/customers");
}

/** Kundenportal: persönlichen Link erzeugen bzw. deaktivieren. */
export async function setPortalLink(formData: FormData) {
  const ctx = await requireOffice();
  const customer = await db.customer.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  if (!customer) return;
  const enable = formData.get("enable") === "1";
  await db.customer.update({ where: { id: customer.id }, data: { portalToken: enable ? randomBytes(18).toString("base64url") : null } });
  revalidatePath(`/customers/${customer.id}`);
}
