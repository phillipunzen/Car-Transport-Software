"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { nextNumber, requireCtx } from "@/lib/org";
import { str } from "@/lib/format";
import type { FormState } from "@/components/action-form";

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
  } as const;
}

function validate(data: ReturnType<typeof customerData>) {
  if (data.type === "COMPANY" && !data.companyName) return "Bitte gib einen Firmennamen an.";
  if (data.type === "PRIVATE" && !data.lastName) return "Bitte gib einen Nachnamen an.";
}

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
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
  const ctx = await requireCtx();
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
  const ctx = await requireCtx();
  const id = String(formData.get("id"));
  const used = await db.order.count({ where: { customerId: id } }) + (await db.invoice.count({ where: { customerId: id } }));
  if (used > 0) throw new Error("Kunde hat Aufträge oder Rechnungen und kann nicht gelöscht werden.");
  await db.customer.deleteMany({ where: { id, organizationId: ctx.orgId } });
  redirect("/customers");
}
