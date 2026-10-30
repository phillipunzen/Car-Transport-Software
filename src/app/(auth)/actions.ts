"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, signIn } from "@/auth";
import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/lib/org";
import { checkPassword, isLocked, lockedMessage } from "@/lib/login-guard";
import { sendVerificationMail } from "@/lib/email-verification";
import { mailEnabled } from "@/lib/mail";
import { PasswordSchema, resetPassword, sendPasswordResetMail } from "@/lib/password-reset";
import type { FormState } from "@/components/action-form";

const safeCallback = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
};

export type LoginState = { error?: string; needsCode?: boolean } | undefined;

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  // Sperre und Fehlversuche verwaltet login-guard (gilt auch im Credentials-Endpoint von Auth.js)
  const user = await db.user.findUnique({ where: { email } });
  if (user && isLocked(user)) return { error: lockedMessage, needsCode: Boolean(code) };

  // Schritt 1: Passwort prüfen – bei aktivierter Zwei-Faktor-Anmeldung zuerst den Code abfragen
  if (user?.passwordHash && user.totpEnabled && !code) {
    const result = await checkPassword(user, password);
    if (result === "ok") return { needsCode: true };
    return { error: result === "locked" ? lockedMessage : "E-Mail oder Passwort ist falsch." };
  }
  try {
    await signIn("credentials", { email, password, code, redirectTo: safeCallback(formData.get("callbackUrl")) });
  } catch (e) {
    if (e instanceof AuthError) {
      const now = await db.user.findUnique({ where: { email }, select: { lockedUntil: true } });
      if (now && isLocked(now)) return { error: lockedMessage, needsCode: Boolean(code) };
      return code ? { error: "Der Code ist ungültig oder abgelaufen.", needsCode: true } : { error: "E-Mail oder Passwort ist falsch." };
    }
    throw e;
  }
}

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an."),
  company: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email("Bitte gib eine gültige E-Mail-Adresse an."),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein."),
});

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, company, email, password } = parsed.data;

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "Für diese E-Mail-Adresse existiert bereits ein Konto." };
  }
  const user = await db.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12) },
  });
  await sendVerificationMail(user).catch((e) => console.error("Bestätigungs-Mail fehlgeschlagen", e));

  // Wer über eine Einladung kommt, bekommt keine eigene Instanz aufgezwungen
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  if (!callbackUrl.startsWith("/invite/")) {
    await createOrganizationForUser(user.id, company || name);
  }

  await signIn("credentials", { email, password, redirectTo: callbackUrl });
}

export async function resendVerification(): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Bitte zuerst anmelden." };
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (!user) return { error: "Bitte zuerst anmelden." };
  try {
    const result = await sendVerificationMail(user);
    if (result === "verified") return { ok: "Deine E-Mail-Adresse ist bereits bestätigt." };
    if (result === "disabled") return { error: "Auf diesem Server ist kein E-Mail-Versand eingerichtet. Bitte wende dich an den Administrator." };
    if (result === "throttled") return { error: "Eine E-Mail wurde gerade erst gesendet. Bitte warte eine Minute." };
    return { ok: `Bestätigungslink an ${user.email} gesendet.` };
  } catch (e) {
    console.error("Bestätigungs-Mail fehlgeschlagen", e);
    return { error: "Die E-Mail konnte nicht gesendet werden." };
  }
}

/** Immer dieselbe Antwort – ob es ein Konto zur Adresse gibt, bleibt verborgen. */
export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Bitte gib eine gültige E-Mail-Adresse an." };
  if (!mailEnabled()) {
    return { error: "Auf diesem Server ist kein E-Mail-Versand eingerichtet. Bitte wende dich an den Administrator." };
  }
  // Nicht abwarten: Sonst verriete die Antwortzeit, ob eine E-Mail verschickt wurde
  void sendPasswordResetMail(email.data).catch((e) => console.error("Mail zum Zurücksetzen fehlgeschlagen", e));
  return { ok: `Falls es ein Konto für ${email.data} gibt, ist ein Link zum Zurücksetzen unterwegs. Bitte schau auch im Spam-Ordner nach.` };
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const password = PasswordSchema.safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  if (formData.get("password") !== formData.get("confirm")) return { error: "Die beiden Passwörter stimmen nicht überein." };
  const email = await resetPassword(String(formData.get("token") ?? ""), password.data);
  if (!email) return { error: "Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an." };
  redirect(`/login?reset=1&email=${encodeURIComponent(email)}`);
}

export async function socialSignIn(formData: FormData) {
  const provider = String(formData.get("provider"));
  if (provider !== "google" && provider !== "apple") return;
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}
