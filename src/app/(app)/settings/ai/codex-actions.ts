"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/org";
import { canManageAppAi } from "@/lib/chatgpt-admin";
import { cancelCodexLogin, chooseCodexModel, completeCodexLogin, disconnectCodex, startCodexLogin, type CodexLogin } from "@/lib/codex";
import type { FormState } from "@/components/action-form";

async function appAdmin() {
  const ctx = await requireCtx();
  return canManageAppAi(ctx.user);
}
const denied = "Nur App-Administratoren dürfen die zentrale Codex-Verbindung verwalten.";
const message = (error: unknown) => error instanceof Error ? error.message : "Codex-Anfrage fehlgeschlagen.";

export async function startDeviceLogin(consent: boolean): Promise<{ login?: CodexLogin; error?: string }> {
  if (!await appAdmin()) return { error: denied };
  if (consent !== true) return { error: "Bitte die Nutzung für alle Benutzer und Mandanten bestätigen." };
  try { return { login: await startCodexLogin() }; }
  catch (error) { return { error: message(error) }; }
}

export async function pollDeviceLogin(): Promise<{ status?: string; active?: boolean; error?: string }> {
  if (!await appAdmin()) return { error: denied };
  try {
    const status = await completeCodexLogin();
    const completed = status.login?.status === "completed" && status.connected && status.active;
    if (completed) revalidatePath("/", "layout");
    return { status: status.login?.status === "completed" && !status.active ? "superseded" : status.login?.status ?? "missing", active: completed };
  } catch (error) { return { error: message(error) }; }
}

export async function cancelDeviceLogin(loginId: string): Promise<{ error?: string }> {
  if (!await appAdmin()) return { error: denied };
  try { await cancelCodexLogin(loginId); return {}; }
  catch (error) { return { error: message(error) }; }
}

export async function selectCodexModel(_state: FormState, formData: FormData): Promise<FormState> {
  if (!await appAdmin()) return { error: denied };
  try {
    await chooseCodexModel(String(formData.get("model")));
    revalidatePath("/", "layout");
    return { ok: "Codex-Modell für die ganze App ausgewählt." };
  } catch (error) { return { error: message(error) }; }
}

export async function disconnectCodexConnection(): Promise<FormState> {
  if (!await appAdmin()) return { error: denied };
  try {
    await disconnectCodex();
    revalidatePath("/", "layout");
    return { ok: "Codex abgemeldet. Es gilt wieder die übrige zentrale Erkennungskonfiguration." };
  } catch (error) { return { error: message(error) }; }
}
