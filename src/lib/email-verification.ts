import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl, mailEnabled, sendMail } from "@/lib/mail";

/**
 * Bestätigung der E-Mail-Adresse bei Registrierung mit Passwort.
 * Erst eine bestätigte Adresse darf mit Google/Apple verknüpft werden.
 */
const VALID_MS = 24 * 3600000;
const RESEND_AFTER_MS = 60000;
const identifier = (email: string) => `verify-email:${email.toLowerCase()}`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type SendResult = "sent" | "disabled" | "verified" | "throttled";

export async function sendVerificationMail(user: { email: string; emailVerified: Date | null }): Promise<SendResult> {
  if (user.emailVerified) return "verified";
  if (!mailEnabled()) return "disabled";
  const id = identifier(user.email);
  const recent = await db.verificationToken.findFirst({ where: { identifier: id, expires: { gt: new Date(Date.now() + VALID_MS - RESEND_AFTER_MS) } } });
  if (recent) return "throttled";

  const token = randomBytes(32).toString("base64url");
  await db.verificationToken.deleteMany({ where: { identifier: id } });
  await db.verificationToken.create({ data: { identifier: id, token: hash(token), expires: new Date(Date.now() + VALID_MS) } });
  await sendMail(
    user.email,
    "Bitte bestätige deine E-Mail-Adresse",
    `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für dein Konto:\n${appUrl()}/verify-email/${token}\n\nDer Link ist 24 Stunden gültig. Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.`,
  );
  return "sent";
}

/** Löst einen Bestätigungslink ein. Liefert die bestätigte Adresse oder null. */
export async function confirmEmail(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const record = await db.verificationToken.findUnique({ where: { token: hash(token) } });
  if (!record?.identifier.startsWith("verify-email:")) return null;
  await db.verificationToken.deleteMany({ where: { identifier: record.identifier } });
  if (record.expires < new Date()) return null;
  const email = record.identifier.slice("verify-email:".length);
  const { count } = await db.user.updateMany({ where: { email, emailVerified: null }, data: { emailVerified: new Date() } });
  return count || (await db.user.findFirst({ where: { email, emailVerified: { not: null } } })) ? email : null;
}
