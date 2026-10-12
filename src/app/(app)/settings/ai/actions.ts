"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/org";
import { chooseChatgptProfile, disconnectChatgptProfile, importChatgptProfile } from "@/lib/chatgpt";
import type { FormState } from "@/components/action-form";

export async function importConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const file = formData.get("connection");
  if (!(file instanceof File) || !file.size || file.size > 100000) return { error: "Bitte die Verbindungsdatei chatgpt-connection.json auswählen (max. 100 KB)." };
  if (formData.get("consent") !== "on") return { error: "Bitte die Verwendung deines ChatGPT-Abos und die Übertragung der Dokumente bestätigen." };
  try {
    await importChatgptProfile(ctx.user.id, JSON.parse(await file.text()));
    revalidatePath("/", "layout");
    return { ok: "Du verwendest jetzt dein ChatGPT-Abo für die Erkennung. Bitte danach die lokale Verbindungsdatei löschen. Nutzung und Limits kannst du in den ChatGPT-Einstellungen verwalten." };
  } catch {
    return { error: "Die Verbindung konnte nicht importiert werden. Bitte das Anmeldeprogramm erneut ausführen, die Abo-Nutzung erlauben und die neue Datei importieren. Voraussetzung ist ein berechtigtes ChatGPT-Konto und ein Server mit AUTH_SECRET (mindestens 32 Zeichen)." };
  }
}

export async function selectConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  try {
    await chooseChatgptProfile(ctx.user.id, String(formData.get("profileId")), String(formData.get("model")));
    revalidatePath("/", "layout");
    return { ok: "ChatGPT-Konto und Modell ausgewählt." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Die Verbindung konnte nicht ausgewählt werden." }; }
}

export async function disconnectConnection(_state: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  try {
    const revoked = await disconnectChatgptProfile(ctx.user.id, String(formData.get("profileId")));
    revalidatePath("/", "layout");
    return { ok: revoked ? "ChatGPT-Verbindung getrennt." : "Die Verbindung ist hier getrennt. Der Widerruf bei OpenAI konnte nicht bestätigt werden. Bitte die App zusätzlich in den ChatGPT-Einstellungen trennen." };
  } catch { return { error: "Die Verbindung konnte nicht getrennt werden. Bitte erneut versuchen." }; }
}
