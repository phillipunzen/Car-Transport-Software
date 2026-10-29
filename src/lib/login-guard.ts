import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Bremse gegen Durchprobieren von Passwörtern und Zwei-Faktor-Codes.
 * Liegt in der Datenbank, damit sie für alle App-Instanzen und für jeden
 * Anmeldeweg gilt (Formular und /api/auth/callback/credentials).
 */
export const MAX_FAILED_LOGINS = 10;
const LOCK_BASE_MS = 15 * 60000;
const LOCK_MAX_MS = 60 * 60000;

type Guarded = { id: string; failedLogins: number; lockedUntil: Date | null };

export const isLocked = (user: Pick<Guarded, "lockedUntil">, now = Date.now()) => Boolean(user.lockedUntil && user.lockedUntil.getTime() > now);

/** Ab dem 10. Fehlversuch 15 Minuten Sperre, jeder weitere verdoppelt sie (höchstens 1 Stunde). */
export function lockDuration(failedLogins: number) {
  if (failedLogins < MAX_FAILED_LOGINS) return 0;
  return Math.min(LOCK_BASE_MS * 2 ** (failedLogins - MAX_FAILED_LOGINS), LOCK_MAX_MS);
}

export async function recordFailedLogin(userId: string) {
  const { failedLogins } = await db.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  const ms = lockDuration(failedLogins);
  if (ms) await db.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + ms) } });
}

export async function resetFailedLogins(user: Guarded) {
  if (user.failedLogins || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
}

/** Passwort prüfen – gesperrte Konten werden gar nicht erst geprüft, Fehlversuche zählen mit. */
export async function checkPassword(user: Guarded & { passwordHash: string | null }, password: string): Promise<"ok" | "wrong" | "locked"> {
  if (!user.passwordHash) return "wrong";
  if (isLocked(user)) return "locked";
  if (await bcrypt.compare(password, user.passwordHash)) return "ok";
  await recordFailedLogin(user.id);
  return "wrong";
}

export const lockedMessage = "Zu viele Fehlversuche. Die Anmeldung ist vorübergehend gesperrt – bitte später erneut versuchen.";
