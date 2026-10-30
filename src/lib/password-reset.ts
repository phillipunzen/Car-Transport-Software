import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { appUrl, mailEnabled, sendMail } from "@/lib/mail";

/**
 * „Passwort vergessen“: Einmal-Link per E-Mail, 1 Stunde gültig.
 * Gespeichert wird nur der Hash des Links. Ein neuer Link frühestens nach 2 Minuten,
 * damit sich fremde Postfächer nicht zuspammen lassen.
 */
const VALID_MS = 3600000;
const RESEND_AFTER_MS = 2 * 60000;
const PREFIX = "reset-password:";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const wellFormed = (token: string) => /^[A-Za-z0-9_-]{20,100}$/.test(token);

export const PasswordSchema = z
  .string()
  .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.")
  .max(128, "Das Passwort darf höchstens 128 Zeichen lang sein.");

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

/** Sitzung begann vor der letzten Passwortänderung? Ältere Tokens ohne authAt zählen mit ihrem Ausstellungszeitpunkt. */
export function startedBeforePasswordChange(token: { authAt?: number; iat?: number }, passwordChangedAt: Date | null) {
  if (!passwordChangedAt) return false;
  const started = token.authAt ?? (token.iat ?? 0) * 1000;
  return started < passwordChangedAt.getTime();
}

export type ResetRequestResult = "sent" | "unknown" | "throttled" | "disabled";

/** Verschickt einen Reset-Link, falls es ein Konto zu der Adresse gibt. */
export async function sendPasswordResetMail(email: string): Promise<ResetRequestResult> {
  if (!mailEnabled()) return "disabled";
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true, email: true } });
  if (!user) return "unknown";
  const identifier = PREFIX + user.id;
  const recent = await db.verificationToken.findFirst({ where: { identifier, expires: { gt: new Date(Date.now() + VALID_MS - RESEND_AFTER_MS) } } });
  if (recent) return "throttled";

  const token = randomBytes(32).toString("base64url");
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token: hash(token), expires: new Date(Date.now() + VALID_MS) } });
  await sendMail(
    user.email,
    "Passwort zurücksetzen",
    `Hallo,\n\nfür dein Konto wurde ein neues Passwort angefordert. Über diesen Link kannst du es festlegen:\n${appUrl()}/reset-password/${token}\n\nDer Link ist 1 Stunde gültig und funktioniert nur einmal. Falls du das nicht warst, kannst du diese E-Mail ignorieren – dein bisheriges Passwort bleibt gültig.`,
  );
  return "sent";
}

async function findValid(token: string) {
  if (!wellFormed(token)) return null;
  const record = await db.verificationToken.findUnique({ where: { token: hash(token) } });
  if (!record?.identifier.startsWith(PREFIX) || record.expires < new Date()) return null;
  return record;
}

/** Prüft einen Link, ohne ihn zu verbrauchen (für die Anzeige des Formulars). */
export async function isResetTokenValid(token: string) {
  return Boolean(await findValid(token));
}

/**
 * Löst den Link ein und setzt das neue Passwort. Hebt eine Login-Sperre auf, bestätigt die
 * E-Mail-Adresse (der Link kam aus dem Postfach) und meldet alle bestehenden Sitzungen ab.
 * Liefert die E-Mail-Adresse oder null, wenn der Link nicht (mehr) gilt.
 */
export async function resetPassword(token: string, password: string) {
  const record = await findValid(token);
  if (!record) return null;
  // Erst den Link löschen – nur wer ihn tatsächlich gelöscht hat, darf das Passwort setzen
  const { count } = await db.verificationToken.deleteMany({ where: { identifier: record.identifier } });
  if (!count) return null;
  const userId = record.identifier.slice(PREFIX.length);
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user) return null;
  const now = new Date();
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      passwordChangedAt: now,
      failedLogins: 0,
      lockedUntil: null,
      ...(user.emailVerified ? {} : { emailVerified: now }),
    },
    select: { email: true },
  });
  return updated.email;
}
