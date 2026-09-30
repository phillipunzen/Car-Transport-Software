"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { RETURN_TYPE } from "@/lib/labels";
import { normalizeLogo } from "@/lib/logo";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/org";
import { decimal, str } from "@/lib/format";
import { deleteFile, saveUpload } from "@/lib/files";
import { appUrl, sendMail } from "@/lib/mail";
import { ROLE } from "@/lib/labels";
import type { FormState } from "@/components/action-form";

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch {
    return { error: "Nur Inhaber und Administratoren dürfen die Einstellungen ändern." };
  }
  const iban = str(formData.get("iban"))?.replace(/\s/g, "").toUpperCase() ?? null;
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return { error: "Die IBAN scheint ungültig zu sein." };
  const nextInvoiceNumber = Math.round(decimal(formData.get("nextInvoiceNumber")) ?? ctx.org.nextInvoiceNumber);
  if (nextInvoiceNumber < 1) return { error: "Die nächste Rechnungsnummer muss mindestens 1 sein." };

  const nextQuoteNumber = Math.round(decimal(formData.get("nextQuoteNumber")) ?? ctx.org.nextQuoteNumber);
  if (nextQuoteNumber < 1) return { error: "Die nächste Angebotsnummer muss mindestens 1 sein." };
  const money = (name: string, fallback: number) => Math.max(0, decimal(formData.get(name)) ?? fallback);
  const returnType = String(formData.get("defaultReturnType") ?? "NONE");

  const requestEnabled = formData.get("requestEnabled") === "on";
  let logoFileId = ctx.org.logoFileId;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    let png: File;
    try {
      png = await normalizeLogo(logo);
    } catch (e) {
      return { error: e instanceof Error && /Logo/.test(e.message) ? e.message : "Das Logo konnte nicht gelesen werden. Bitte PNG, JPG, WebP oder SVG verwenden." };
    }
    const { record } = await saveUpload(ctx.orgId, ctx.user.id, png);
    if (logoFileId) await deleteFile(ctx.orgId, logoFileId);
    logoFileId = record.id;
  } else if (formData.get("removeLogo") === "on" && logoFileId) {
    await deleteFile(ctx.orgId, logoFileId);
    logoFileId = null;
  }

  await db.organization.update({
    where: { id: ctx.orgId },
    data: {
      name: str(formData.get("companyName")) ?? ctx.org.name,
      companyName: str(formData.get("companyName")),
      ownerName: str(formData.get("ownerName")),
      street: str(formData.get("street")),
      zip: str(formData.get("zip")),
      city: str(formData.get("city")),
      country: str(formData.get("country")),
      phone: str(formData.get("phone")),
      email: str(formData.get("email")),
      website: str(formData.get("website")),
      taxNumber: str(formData.get("taxNumber")),
      vatId: str(formData.get("vatId")),
      bankName: str(formData.get("bankName")),
      accountHolder: str(formData.get("accountHolder")),
      iban,
      bic: str(formData.get("bic"))?.toUpperCase() ?? null,
      invoicePrefix: str(formData.get("invoicePrefix")) ?? "",
      nextInvoiceNumber,
      paymentTermDays: Math.max(0, Math.round(decimal(formData.get("paymentTermDays")) ?? 14)),
      defaultVatRate: decimal(formData.get("defaultVatRate")) ?? 19,
      smallBusiness: formData.get("smallBusiness") === "on",
      defaultPricePerKm: decimal(formData.get("defaultPricePerKm")),
      invoiceIntroText: str(formData.get("invoiceIntroText")),
      invoiceFooterText: str(formData.get("invoiceFooterText")),
      protocolTerms: str(formData.get("protocolTerms")),
      defaultReturnType: RETURN_TYPE[returnType] ? returnType : "NONE",
      defaultReturnFlat: decimal(formData.get("defaultReturnFlat")),
      defaultReturnPerKm: decimal(formData.get("defaultReturnPerKm")),
      perDiemEnabled: formData.get("perDiemEnabled") === "on",
      perDiemPartial: money("perDiemPartial", 14),
      perDiemFull: money("perDiemFull", 28),
      quotePrefix: str(formData.get("quotePrefix")) ?? "",
      nextQuoteNumber,
      quoteValidDays: Math.max(1, Math.round(decimal(formData.get("quoteValidDays")) ?? 30)),
      dunningFee1: money("dunningFee1", 0),
      dunningFee2: money("dunningFee2", 5),
      dunningFee3: money("dunningFee3", 10),
      dunningDays: Math.max(1, Math.round(decimal(formData.get("dunningDays")) ?? 7)),
      notifyCustomerOnStatus: formData.get("notifyCustomerOnStatus") === "on",
      requestEnabled,
      // Beim Aktivieren einen neuen, nicht erratbaren Link erzeugen
      ...(requestEnabled && !ctx.org.requestToken ? { requestToken: randomBytes(12).toString("base64url") } : {}),
      ...(!requestEnabled ? { requestToken: null } : {}),
      logoFileId,
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Einstellungen gespeichert." };
}

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  let ctx;
  try {
    ctx = await requireManager();
  } catch {
    return { error: "Nur Inhaber und Administratoren dürfen Mitglieder einladen." };
  }
  const parsed = InviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, role } = parsed.data;

  const already = await db.membership.findFirst({ where: { organizationId: ctx.orgId, user: { email } } });
  if (already) return { error: "Diese Person ist bereits Mitglied." };

  const token = randomBytes(24).toString("base64url");
  await db.invitation.create({
    data: { organizationId: ctx.orgId, email, role, token, invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 14 * 86400000) },
  });
  const link = `${appUrl()}/invite/${token}`;
  let mailed = false;
  try {
    mailed = await sendMail(
      email,
      `Einladung zu ${ctx.org.name}`,
      `Hallo,\n\n${ctx.user.name ?? ctx.user.email} lädt dich ein, bei „${ctx.org.name}“ als ${ROLE[role]} mitzuarbeiten.\n\nEinladung annehmen:\n${link}\n\nDer Link ist 14 Tage gültig.`,
    );
  } catch (e) {
    console.error("Einladungs-Mail fehlgeschlagen", e);
  }
  revalidatePath("/settings/team");
  return { ok: mailed ? `Einladung an ${email} versendet.` : `Einladung erstellt. Teile diesen Link: ${link}` };
}

export async function revokeInvitation(formData: FormData) {
  const ctx = await requireManager();
  await db.invitation.deleteMany({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  revalidatePath("/settings/team");
}

export async function changeRole(formData: FormData) {
  const ctx = await requireManager();
  const membership = await db.membership.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  const role = String(formData.get("role")) as Role;
  if (!membership || !ROLE[role]) return;
  if (membership.role === "OWNER" && ctx.role !== "OWNER") throw new Error("Nur Inhaber können Inhaber ändern.");
  if (role === "OWNER" && ctx.role !== "OWNER") throw new Error("Nur Inhaber können weitere Inhaber ernennen.");
  if (membership.role === "OWNER" && role !== "OWNER") {
    const owners = await db.membership.count({ where: { organizationId: ctx.orgId, role: "OWNER" } });
    if (owners <= 1) throw new Error("Es muss mindestens einen Inhaber geben.");
  }
  await db.membership.update({ where: { id: membership.id }, data: { role } });
  revalidatePath("/settings/team");
}

export async function removeMember(formData: FormData) {
  const ctx = await requireManager();
  const membership = await db.membership.findFirst({ where: { id: String(formData.get("id")), organizationId: ctx.orgId } });
  if (!membership) return;
  if (membership.role === "OWNER") throw new Error("Inhaber können nicht entfernt werden.");
  await db.membership.delete({ where: { id: membership.id } });
  revalidatePath("/settings/team");
}
