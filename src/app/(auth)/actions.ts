"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { createOrganizationForUser } from "@/lib/org";
import type { FormState } from "@/components/action-form";

const safeCallback = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
};

export type LoginState = { error?: string; needsCode?: boolean } | undefined;

// Einfache Bremse gegen Durchprobieren (pro Server-Instanz)
const attempts = new Map<string, number[]>();
function tooMany(key: string) {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < 10 * 60000);
  list.push(now);
  attempts.set(key, list);
  if (attempts.size > 10000) attempts.clear();
  return list.length > 10;
}

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (tooMany(email)) return { error: "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.", needsCode: Boolean(code) };

  // Schritt 1: Passwort prüfen – bei aktivierter Zwei-Faktor-Anmeldung zuerst den Code abfragen
  const user = await db.user.findUnique({ where: { email } });
  if (user?.passwordHash && user.totpEnabled && !code && (await bcrypt.compare(password, user.passwordHash))) {
    return { needsCode: true };
  }
  try {
    await signIn("credentials", { email, password, code, redirectTo: safeCallback(formData.get("callbackUrl")) });
  } catch (e) {
    if (e instanceof AuthError) {
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

  // Wer über eine Einladung kommt, bekommt keine eigene Instanz aufgezwungen
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  if (!callbackUrl.startsWith("/invite/")) {
    await createOrganizationForUser(user.id, company || name);
  }

  await signIn("credentials", { email, password, redirectTo: callbackUrl });
}

export async function socialSignIn(formData: FormData) {
  const provider = String(formData.get("provider"));
  if (provider !== "google" && provider !== "apple") return;
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}
