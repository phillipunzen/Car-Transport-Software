import { z } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import { chatgptHostId } from "@/lib/chatgpt";

const ModelSchema = z.object({ model: z.string(), displayName: z.string(), isDefault: z.boolean() });
const LoginSchema = z.object({
  loginId: z.string().max(191), verificationUrl: z.literal("https://auth.openai.com/codex/device"),
  userCode: z.string().min(1).max(100), status: z.enum(["pending", "completed", "failed", "expired"]), expiresAt: z.number(),
});
const StatusSchema = z.object({ connected: z.boolean(), email: z.string().nullable(), planType: z.string().nullable(), models: z.array(ModelSchema), login: LoginSchema.nullable() });
export type CodexStatus = z.infer<typeof StatusSchema>;
export type CodexLogin = z.infer<typeof LoginSchema>;
// The repository's Compose service is the default, including older deployments
// that update the image without adding CODEX_BRIDGE_URL to their app environment.
const bridgeUrl = () => process.env.CODEX_BRIDGE_URL?.trim() || "http://codex:3100";
export const codexConfigured = () => (process.env.CODEX_BRIDGE_SECRET || process.env.AUTH_SECRET || "").length >= 32;

async function bridgeRequest(route: string, body: unknown = {}, timeout = 30000) {
  const base = bridgeUrl();
  const secret = process.env.CODEX_BRIDGE_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Für die Codex-Anmeldung muss AUTH_SECRET oder CODEX_BRIDGE_SECRET auf dem Server mindestens 32 Zeichen enthalten.");
  let response;
  try {
    response = await fetch(new URL(route, base), {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeout),
    });
  } catch { throw new Error("Der Codex-Dienst ist gerade nicht erreichbar. Bitte den App-Administrator informieren."); }
  if (!response.ok) throw new Error("Die Codex-Anfrage ist fehlgeschlagen. Bitte Verbindung und Kontingent prüfen. PDFs dürfen höchstens 8 Seiten enthalten; insgesamt sind 12 Bilder/Seiten möglich.");
  return response.json();
}

export async function codexStatus(): Promise<CodexStatus> { return StatusSchema.parse(await bridgeRequest("/status")); }

export async function startCodexLogin() {
  await chatgptHostId();
  const login = LoginSchema.parse(await bridgeRequest("/login/start"));
  await db.chatgptHost.update({ where: { id: "runtime" }, data: { codexLoginId: login.loginId } });
  return login;
}

/** Polling is durable across app replicas; the dedicated bridge owns the pending flow. */
export async function completeCodexLogin() {
  const status = await codexStatus();
  if (status.connected && status.login?.status === "completed" && status.models.length) {
    const model = (status.models.find((m) => m.isDefault) ?? status.models[0]).model;
    await db.chatgptHost.updateMany({
      where: { id: "runtime", codexLoginId: status.login.loginId },
      data: { aiProvider: "codex", codexModel: model, codexLoginId: null },
    });
  }
  const host = await db.chatgptHost.findUnique({ where: { id: "runtime" }, select: { aiProvider: true } });
  return { ...status, active: host?.aiProvider === "codex" };
}

export async function chooseCodexModel(model: string) {
  const status = await codexStatus();
  if (!status.connected || !status.models.some((m) => m.model === model)) throw new Error("Bitte Codex verbinden und ein verfügbares Bildmodell auswählen.");
  await chatgptHostId();
  await db.chatgptHost.update({ where: { id: "runtime" }, data: { aiProvider: "codex", codexModel: model, codexLoginId: null } });
}

export async function cancelCodexLogin(loginId: string) {
  await db.chatgptHost.updateMany({ where: { id: "runtime", codexLoginId: loginId }, data: { codexLoginId: null } });
  await bridgeRequest("/login/cancel", { loginId });
}

export async function disconnectCodex() {
  // Clear pending activation before signing out so stale polling cannot reactivate it.
  await db.chatgptHost.updateMany({ where: { id: "runtime" }, data: { codexLoginId: null } });
  await bridgeRequest("/logout");
  await db.chatgptHost.updateMany({ where: { id: "runtime", aiProvider: "codex" }, data: { aiProvider: "chatgpt", codexModel: null } });
}

export async function extractWithCodex<S extends z.ZodType>(files: { data: Buffer; mimeType: string }[], instruction: string, schema: S): Promise<z.infer<S>> {
  const host = await db.chatgptHost.findUnique({ where: { id: "runtime" } });
  if (host?.aiProvider !== "codex" || !host.codexModel) throw new Error("Bitte den App-Administrator bitten, die zentrale Codex-Verbindung einzurichten.");
  const inputs = await Promise.all(files.map(async (file) => {
    if (file.mimeType === "application/pdf") return { data: file.data.toString("base64"), mimeType: file.mimeType };
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimeType)) throw new Error("Bitte ein Bild oder eine PDF-Datei verwenden.");
    const data = await sharp(file.data, { limitInputPixels: 40000000 }).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    return { data: data.toString("base64"), mimeType: "image/jpeg" };
  }));
  const response = await bridgeRequest("/extract", { files: inputs, model: host.codexModel, instruction, schema: z.toJSONSchema(schema, { target: "draft-7" }) }, 150000);
  const result = schema.safeParse(response.data);
  if (!result.success) throw new Error("Codex lieferte keine gültigen Daten. Bitte erneut versuchen oder manuell eintragen.");
  return result.data;
}
