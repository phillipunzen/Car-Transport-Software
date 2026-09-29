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

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").toLowerCase().trim(),
      password: String(formData.get("password") ?? ""),
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
  } catch (e) {
    if (e instanceof AuthError) return { error: "E-Mail oder Passwort ist falsch." };
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
