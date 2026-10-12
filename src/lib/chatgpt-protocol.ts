import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
export const CredentialsSchema = z.object({
  client_id: z.string().regex(/^oaiapp_[A-Za-z0-9_-]+$/).max(191),
  issuer: z.literal(CHATGPT_ISSUER),
  ext_agent_host_id: z.string().min(1).max(300),
  subject: z.string().min(1).max(191),
  email: z.string().email().max(191),
  id_token: z.string().min(1).max(20000),
  access_token: z.string().min(1).max(20000),
  refresh_token: z.string().min(1).max(20000),
  token_type: z.literal("Bearer"),
  scopes: z.array(z.string()).refine((s) => s.includes("chatgpt.tokens.use.direct") && s.includes("resource.invoke")),
  expires_in: z.number().int().positive().max(86400),
  saved_at: z.string().datetime(),
  nonce: z.string().min(20).max(200),
});
export type ChatgptCredentials = z.infer<typeof CredentialsSchema>;

function key() {
  const secret = process.env.CHATGPT_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Für die ChatGPT-Verbindung muss AUTH_SECRET oder CHATGPT_TOKEN_SECRET mindestens 32 Zeichen haben.");
  return Buffer.from(hkdfSync("sha256", secret, "car-transport-software", "chatgpt-tokens-v1", 32));
}

export function encryptCredentials(value: ChatgptCredentials, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCredentials(value: string, userId: string): ChatgptCredentials {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("ChatGPT-Verbindung erneut herstellen.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return CredentialsSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")));
}

export function chatgptError(code?: string): string {
  if (code === "subscription_sharing_usage_limit_exceeded" || code === "subscription_sharing_usage_unavailable" || code === "rate_limit_exceeded") {
    return "Das ChatGPT-Nutzungslimit ist erreicht oder dein Abo ist hier nicht verfügbar. Bitte Nutzung unter Einstellungen → KI → Nutzung verwalten prüfen.";
  }
  if (code === "invalid_grant" || code === "invalid_token" || code === "authentication_error") return "Bitte deine ChatGPT-Verbindung unter Einstellungen → KI erneut herstellen.";
  return "Die ChatGPT-Erkennung ist fehlgeschlagen. Bitte Verbindung und Modellauswahl unter Einstellungen → KI prüfen.";
}

/** Read SSE through its terminal event; a partial answer must never become saved data. */
export async function readChatgptStream(response: Response): Promise<string> {
  if (!response.body) throw new Error(chatgptError());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  let completed = false;
  let refusal = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).trimEnd();
        pending = pending.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.output_text.delta") text += event.delta;
        if (text.length > 100000) throw new Error(chatgptError());
        if (event.type === "response.refusal.delta") refusal = true;
        if (event.type === "response.failed" || event.type === "error") throw new Error(chatgptError(event.response?.error?.code ?? event.code ?? event.error?.code));
        if (event.type === "response.incomplete") throw new Error("Die ChatGPT-Erkennung wurde nicht vollständig abgeschlossen. Bitte erneut versuchen.");
        if (event.type === "response.completed") completed = true;
      }
      if (done) break;
    }
    if (!completed || !text || refusal) throw new Error("ChatGPT lieferte kein vollständig verwertbares Ergebnis.");
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
