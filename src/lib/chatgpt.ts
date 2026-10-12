import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { CHATGPT_ISSUER, CHATGPT_RESOURCE, CredentialsSchema, chatgptError, decryptCredentials, encryptCredentials, readChatgptStream, type ChatgptCredentials } from "@/lib/chatgpt-protocol";

const jwks = createRemoteJWKSet(new URL(`${CHATGPT_ISSUER}/.well-known/jwks.json`));
const TokenSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), id_token: z.string().optional(),
  expires_in: z.number().int().positive(), scope: z.string().optional(), token_type: z.literal("Bearer"),
});
export const ModelCatalogSchema = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })) });
const transactionOptions = { maxWait: 30000, timeout: 90000 };
const credentialContext = (profileId: string) => `chatgpt-app:${profileId}`;

async function checkedFetch(url: string, init: RequestInit, timeout = 20000) {
  let response;
  try { response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeout) }); }
  catch { throw new Error("ChatGPT ist gerade nicht erreichbar. Bitte erneut versuchen."); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(chatgptError(typeof body.error === "string" ? body.error : body.error?.code ?? (response.status === 401 ? "invalid_token" : response.status === 429 ? "rate_limit_exceeded" : undefined)));
  }
  return response;
}

export async function chatgptHostId() {
  const host = await db.chatgptHost.upsert({ where: { id: "runtime" }, create: { id: "runtime", hostId: `urn:uuid:${randomUUID()}` }, update: {} });
  return host.hostId;
}

/** A singleton row serializes selection, import, disconnect and refresh across containers. */
async function lockHost(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{ activeProfileId: string | null }[]>`SELECT activeProfileId FROM ChatgptHost WHERE id = ${"runtime"} FOR UPDATE`;
  if (!rows[0]) throw new Error("Bitte zuerst die zentrale ChatGPT-Verbindung einrichten.");
  return rows[0];
}

export async function hasChatgptPlan() {
  const host = await db.chatgptHost.findUnique({ where: { id: "runtime" }, select: { activeProfile: { select: { credentials: true } } } });
  return Boolean(host?.activeProfile?.credentials);
}

export async function listChatgptModels(accessToken: string) {
  const response = await checkedFetch(`${CHATGPT_RESOURCE}/models`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return ModelCatalogSchema.parse(await response.json()).models.filter((m) => m.visibility === "list");
}

async function saveAppProfile(tx: Prisma.TransactionClient, credentials: ChatgptCredentials, preferredModel: string | null) {
  const existing = await tx.chatgptAppProfile.findUnique({ where: { clientId: credentials.client_id } });
  if (existing && existing.subject !== credentials.subject) throw new Error("Die gespeicherte ChatGPT-Verbindung gehört zu einem anderen Konto.");
  const id = existing?.id ?? randomUUID();
  const encrypted = encryptCredentials(credentials, credentialContext(id));
  const profile = await tx.chatgptAppProfile.upsert({
    where: { clientId: credentials.client_id },
    create: { id, clientId: credentials.client_id, subject: credentials.subject, email: credentials.email, credentials: encrypted, model: preferredModel },
    update: { credentials: encrypted, email: credentials.email, model: preferredModel },
  });
  await tx.chatgptHost.update({ where: { id: "runtime" }, data: { activeProfileId: profile.id, aiProvider: "chatgpt", codexLoginId: null } });
}

export async function importChatgptProfile(raw: unknown) {
  const credentials = CredentialsSchema.parse(raw);
  const { payload } = await jwtVerify(credentials.id_token, jwks, {
    issuer: CHATGPT_ISSUER, audience: credentials.client_id, requiredClaims: ["sub", "exp", "iat", "nonce"], clockTolerance: 5,
  });
  if (payload.sub !== credentials.subject || payload.email !== credentials.email || payload.nonce !== credentials.nonce) throw new Error("Die ChatGPT-Identität stimmt nicht mit der Verbindungsdatei überein.");
  const savedAt = Date.parse(credentials.saved_at);
  if (savedAt > Date.now() + 5000 || savedAt + credentials.expires_in * 1000 <= Date.now() + 60000) throw new Error("Die Verbindungsdatei ist abgelaufen. Bitte das Anmeldeprogramm erneut ausführen.");
  const models = await listChatgptModels(credentials.access_token);
  if (!models.length) throw new Error("Für dieses ChatGPT-Konto sind keine Modelle verfügbar.");
  const hostId = await chatgptHostId();
  await db.$transaction(async (tx) => {
    await lockHost(tx);
    const existing = await tx.chatgptAppProfile.findUnique({ where: { clientId: credentials.client_id } });
    const model = existing?.model && models.some((m) => m.slug === existing.model) ? existing.model : models[0].slug;
    await saveAppProfile(tx, { ...credentials, ext_agent_host_id: hostId }, model);
  }, transactionOptions);
}

/** Explicit transfer only; never make another user's previously personal session public. */
export async function sharePersonalChatgptProfile(userId: string, profileId: string) {
  const hostId = await chatgptHostId();
  await db.$transaction(async (tx) => {
    await lockHost(tx);
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ChatgptProfile WHERE userId = ${userId} AND id = ${profileId} FOR UPDATE`;
    const personal = rows[0] ? await tx.chatgptProfile.findUnique({ where: { id: rows[0].id } }) : null;
    if (!personal?.credentials) throw new Error("Persönliche Verbindung nicht gefunden. Bitte erneut anmelden.");
    const credentials = decryptCredentials(personal.credentials, userId);
    await saveAppProfile(tx, { ...credentials, ext_agent_host_id: hostId }, personal.model);
    // Only one runtime may own this rotating session after the transfer.
    await tx.chatgptProfile.update({ where: { id: personal.id }, data: { credentials: null, active: false } });
  }, transactionOptions);
}

export async function chatgptSession(profileId?: string) {
  return db.$transaction(async (tx) => {
    const host = await lockHost(tx);
    const selected = profileId ?? host.activeProfileId;
    const profile = selected ? await tx.chatgptAppProfile.findUnique({ where: { id: selected } }) : null;
    if (!profile?.credentials) throw new Error("Bitte den App-Administrator bitten, unter Einstellungen → KI die zentrale ChatGPT-Verbindung einzurichten.");
    let credentials = decryptCredentials(profile.credentials, credentialContext(profile.id));
    if (Date.parse(credentials.saved_at) + credentials.expires_in * 1000 < Date.now() + 60000) {
      const response = await checkedFetch(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: profile.clientId, refresh_token: credentials.refresh_token, resource: CHATGPT_RESOURCE }),
      });
      const refreshed = TokenSchema.parse(await response.json());
      credentials = CredentialsSchema.parse({ ...credentials, ...refreshed, scopes: refreshed.scope ? refreshed.scope.split(" ") : credentials.scopes,
        refresh_token: refreshed.refresh_token ?? credentials.refresh_token, saved_at: new Date().toISOString() });
      await tx.chatgptAppProfile.update({ where: { id: profile.id }, data: { credentials: encryptCredentials(credentials, credentialContext(profile.id)) } });
    }
    return { profile, credentials };
  }, transactionOptions);
}

export async function chooseChatgptProfile(profileId: string, model: string) {
  const { credentials } = await chatgptSession(profileId);
  const models = await listChatgptModels(credentials.access_token);
  if (!models.some((m) => m.slug === model)) throw new Error("Dieses Modell ist für das verbundene ChatGPT-Konto nicht verfügbar.");
  await db.$transaction(async (tx) => {
    await lockHost(tx);
    const profile = await tx.chatgptAppProfile.findUnique({ where: { id: profileId } });
    if (!profile?.credentials) throw new Error("Die Verbindung wurde inzwischen getrennt. Bitte erneut anmelden.");
    await tx.chatgptAppProfile.update({ where: { id: profileId }, data: { model } });
    await tx.chatgptHost.update({ where: { id: "runtime" }, data: { activeProfileId: profileId, aiProvider: "chatgpt", codexLoginId: null } });
  }, transactionOptions);
}

export async function disconnectChatgptProfile(profileId: string) {
  return db.$transaction(async (tx) => {
    const host = await lockHost(tx);
    const profile = await tx.chatgptAppProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new Error("Verbindung nicht gefunden.");
    let revoked = !profile.credentials;
    if (profile.credentials) {
      const credentials = decryptCredentials(profile.credentials, credentialContext(profile.id));
      try {
        const discovery = await checkedFetch(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, {}, 5000);
        const endpoint = new URL((await discovery.json()).revocation_endpoint);
        if (endpoint.origin !== CHATGPT_ISSUER) throw new Error("Ungültiger Widerrufs-Endpunkt");
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await checkedFetch(endpoint.href, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: credentials.refresh_token, token_type_hint: "refresh_token", client_id: profile.clientId }) }, 5000);
            revoked = true;
            break;
          } catch { if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300)); }
        }
      } catch { /* Report unconfirmed revocation without exposing tokens. */ }
    }
    await tx.chatgptAppProfile.update({ where: { id: profile.id }, data: { credentials: null } });
    if (host.activeProfileId === profile.id) await tx.chatgptHost.update({ where: { id: "runtime" }, data: { activeProfileId: null } });
    return revoked;
  }, transactionOptions);
}

export async function extractWithChatgpt<S extends z.ZodType>(files: { data: Buffer; mimeType: string }[], instruction: string, schema: S): Promise<z.infer<S>> {
  const { profile, credentials } = await chatgptSession();
  if (!profile.model) throw new Error("Bitte den App-Administrator bitten, unter Einstellungen → KI ein Modell auszuwählen.");
  const content = files.map((file) => {
    if (file.mimeType === "application/pdf") return { type: "input_file", filename: "document.pdf", file_data: `data:application/pdf;base64,${file.data.toString("base64")}` };
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimeType)) throw new Error("Bitte ein Bild oder eine PDF-Datei verwenden.");
    return { type: "input_image", image_url: `data:${file.mimeType};base64,${file.data.toString("base64")}` };
  });
  const response = await checkedFetch(`${CHATGPT_RESOURCE}/responses`, {
    method: "POST", headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: profile.model, instructions: instruction, input: [{ role: "user", content: [...content, { type: "input_text", text: "Lies die Daten aus den angehängten Dokumenten aus." }] }], store: false, stream: true,
      text: { format: { type: "json_schema", name: "extraction", strict: true, schema: z.toJSONSchema(schema, { target: "draft-7" }) } } }),
  }, 120000);
  try { return schema.parse(JSON.parse(await readChatgptStream(response))); }
  catch (error) {
    if (error instanceof Error && !(error instanceof z.ZodError) && !(error instanceof SyntaxError)) throw error;
    throw new Error("ChatGPT lieferte keine gültigen Daten. Bitte erneut versuchen oder manuell eintragen.");
  }
}
