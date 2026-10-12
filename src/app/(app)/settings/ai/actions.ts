"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/org";
import { canManageAppAi } from "@/lib/chatgpt-admin";
import { chooseChatgptProfile, disconnectChatgptProfile, importChatgptProfile, sharePersonalChatgptProfile } from "@/lib/chatgpt";
import type { FormState } from "@/components/action-form";

const denied = { error: "Nur App-Administratoren dürfen die zentrale ChatGPT-Verbindung verwalten." };

export async function importConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!await canManageAppAi(ctx.user)) return denied;
  const file = formData.get("connection");
  if (!(file instanceof File) || !file.size || file.size > 100000) return { error: "Bitte die Verbindungsdatei chatgpt-connection.json auswählen (max. 100 KB)." };
  if (formData.get("consent") !== "on") return { error: "Bitte die Verwendung der Verbindung für alle Benutzer und Mandanten bestätigen." };
  try {
    await importChatgptProfile(JSON.parse(await file.text()));
    revalidatePath("/", "layout");
    return { ok: "Die ganze App verwendet jetzt diese ChatGPT-Verbindung. Bitte die lokale Verbindungsdatei löschen. Alle Benutzer teilen die Limits und gegebenenfalls das freigegebene Guthaben dieses ChatGPT-Kontos." };
  } catch {
    return { error: "Die Verbindung konnte nicht importiert werden. Bitte das Anmeldeprogramm erneut ausführen, die Abo-Nutzung erlauben und die neue Datei importieren. Voraussetzung ist ein berechtigtes ChatGPT-Konto und ein Server mit AUTH_SECRET (mindestens 32 Zeichen)." };
  }
}

export async function sharePersonalConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!await canManageAppAi(ctx.user)) return denied;
  if (formData.get("consent") !== "on") return { error: "Bitte die Verwendung der Verbindung für alle Benutzer und Mandanten bestätigen." };
  try {
    await sharePersonalChatgptProfile(ctx.user.id, String(formData.get("profileId")));
    revalidatePath("/", "layout");
    return { ok: "Die bisher persönliche Verbindung wird jetzt für alle Benutzer und Mandanten verwendet." };
  } catch { return { error: "Die Verbindung konnte nicht übertragen werden. Bitte erneut anmelden und die neue Verbindungsdatei zentral importieren." }; }
}

export async function selectConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!await canManageAppAi(ctx.user)) return denied;
  try {
    await chooseChatgptProfile(String(formData.get("profileId")), String(formData.get("model")));
    revalidatePath("/", "layout");
    return { ok: "ChatGPT-Konto und Modell für die ganze App ausgewählt." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Die Verbindung konnte nicht ausgewählt werden." }; }
}

export async function disconnectConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  if (!await canManageAppAi(ctx.user)) return denied;
  try {
    const revoked = await disconnectChatgptProfile(String(formData.get("profileId")));
    revalidatePath("/", "layout");
    return { ok: revoked ? "Zentrale ChatGPT-Verbindung getrennt." : "Die Verbindung ist hier getrennt. Der Widerruf bei OpenAI konnte nicht bestätigt werden. Bitte die App zusätzlich in den ChatGPT-Einstellungen trennen." };
  } catch { return { error: "Die Verbindung konnte nicht getrennt werden. Bitte erneut versuchen." }; }
}
