"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { canManage, requireCtx } from "@/lib/org";
import { newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

export type TwoFactorState = { error?: string; ok?: string; secret?: string; qr?: string; codes?: string[] } | undefined;

/** Schritt 1: neues Geheimnis erzeugen (noch nicht aktiv) und QR-Code liefern. */
export async function startTwoFactor(): Promise<TwoFactorState> {
  const ctx = await requireCtx();
  const secret = newTotpSecret();
  await db.user.update({ where: { id: ctx.user.id }, data: { totpSecret: secret, totpEnabled: false } });
  const url = otpauthUrl(secret, ctx.user.email, ctx.org.companyName ?? ctx.org.name ?? "Überführung");
  return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

/** Schritt 2: mit einem Code aus der App bestätigen → aktiv, Wiederherstellungscodes einmalig anzeigen. */
export async function confirmTwoFactor(_: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await requireCtx();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.totpSecret) return { error: "Bitte die Einrichtung neu starten." };
  if (!verifyTotp(user.totpSecret, String(formData.get("code") ?? ""))) {
    return { error: "Der Code stimmt nicht. Uhrzeit des Handys prüfen und den aktuellen Code eingeben.", secret: user.totpSecret, qr: String(formData.get("qr") ?? "") };
  }
  const { codes, hashes } = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true, recoveryCodes: hashes } });
  revalidatePath("/", "layout");
  return { ok: "Zwei-Faktor-Anmeldung ist aktiv.", codes };
}

export async function disableTwoFactor(_: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await requireCtx();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (user.totpEnabled && (!user.totpSecret || !verifyTotp(user.totpSecret, String(formData.get("code") ?? "")))) {
    return { error: "Zum Abschalten bitte einen gültigen Code aus der App eingeben." };
  }
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, recoveryCodes: [] } });
  revalidatePath("/", "layout");
  return { ok: "Zwei-Faktor-Anmeldung wurde abgeschaltet." };
}

export async function newCodes(_: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const ctx = await requireCtx();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.totpEnabled || !user.totpSecret || !verifyTotp(user.totpSecret, String(formData.get("code") ?? ""))) {
    return { error: "Bitte einen gültigen Code aus der App eingeben." };
  }
  const { codes, hashes } = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { recoveryCodes: hashes } });
  return { ok: "Neue Wiederherstellungscodes erstellt – die alten sind ungültig.", codes };
}

export async function setRequire2fa(formData: FormData) {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) throw new Error("Keine Berechtigung");
  await db.organization.update({ where: { id: ctx.orgId }, data: { require2fa: formData.get("require2fa") === "on" } });
  revalidatePath("/", "layout");
}
