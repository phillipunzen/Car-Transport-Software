import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { CHATGPT_ISSUER, CHATGPT_RESOURCE, CredentialsSchema, chatgptError, decryptCredentials, encryptCredentials, readChatgptStream } from "@/lib/chatgpt-protocol";

const jwks = createRemoteJWKSet(new URL(`${CHATGPT_ISSUER}/.well-known/jwks.json`));
const TokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.literal("Bearer"),
});
export const ModelCatalogSchema = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })) });

async function checkedFetch(url: string, init: RequestInit, timeout = 20000) {
  let response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new Error("ChatGPT ist gerade nicht erreichbar. Bitte erneut versuchen.");
  }
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

export async function hasChatgptPlan(userId: string) {
  return Boolean(await db.chatgptProfile.findFirst({ where: { userId, active: true, credentials: { not: null } }, select: { id: true } }));
}

export async function listChatgptModels(accessToken: string) {
  const response = await checkedFetch(`${CHATGPT_RESOURCE}/models`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return ModelCatalogSchema.parse(await response.json()).models.filter((m) => m.visibility === "list");
}

export async function importChatgptProfile(userId: string, raw: unknown) {
  const credentials = CredentialsSchema.parse(raw);
  const { payload } = await jwtVerify(credentials.id_token, jwks, {
    issuer: CHATGPT_ISSUER, audience: credentials.client_id,
    requiredClaims: ["sub", "exp", "iat", "nonce"], clockTolerance: 5,
  });
  if (payload.sub !== credentials.subject || payload.email !== credentials.email || payload.nonce !== credentials.nonce) {
    throw new Error("Die ChatGPT-Identität stimmt nicht mit der Verbindungsdatei überein.");
  }
  // Only freshly transferred sessions can be imported; the server owns subsequent refreshes.
  const savedAt = Date.parse(credentials.saved_at);
  if (savedAt > Date.now() + 5000 || savedAt + credentials.expires_in * 1000 <= Date.now() + 60000) {
    throw new Error("Die Verbindungsdatei ist abgelaufen. Bitte das Anmeldeprogramm erneut ausführen.");
  }
  const models = await listChatgptModels(credentials.access_token);
  if (!models.length) throw new Error("Für dieses ChatGPT-Konto sind keine Modelle verfügbar.");
  const encrypted = encryptCredentials({ ...credentials, ext_agent_host_id: await chatgptHostId() }, userId);
  await db.$transaction(async (tx) => {
    const existing = await tx.chatgptProfile.findUnique({ where: { userId_clientId: { userId, clientId: credentials.client_id } } });
    if (existing && existing.subject !== credentials.subject) throw new Error("Die gespeicherte ChatGPT-Verbindung gehört zu einem anderen Konto.");
    await tx.chatgptProfile.updateMany({ where: { userId }, data: { active: false } });
    await tx.chatgptProfile.upsert({
      where: { userId_clientId: { userId, clientId: credentials.client_id } },
      create: { userId, clientId: credentials.client_id, subject: credentials.subject, email: credentials.email, credentials: encrypted, active: true, model: models[0].slug },
      update: { credentials: encrypted, active: true, email: credentials.email, model: existing?.model && models.some((m) => m.slug === existing.model) ? existing.model : models[0].slug },
    });
  });
}

/** MySQL row lock serializes rotating refresh tokens across all app instances. */
export async function chatgptSession(userId: string, profileId?: string) {
  return db.$transaction(async (tx) => {
    const rows = profileId
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ChatgptProfile WHERE userId = ${userId} AND id = ${profileId} FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ChatgptProfile WHERE userId = ${userId} AND active = true FOR UPDATE`;
    const profile = rows[0] ? await tx.chatgptProfile.findUnique({ where: { id: rows[0].id } }) : null;
    if (!profile?.credentials) throw new Error("Bitte zuerst unter Einstellungen → KI mit ChatGPT verbinden.");
    let credentials = decryptCredentials(profile.credentials, userId);
    if (Date.parse(credentials.saved_at) + credentials.expires_in * 1000 < Date.now() + 60000) {
      const response = await checkedFetch(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: profile.clientId, refresh_token: credentials.refresh_token, resource: CHATGPT_RESOURCE }),
      });
      const refreshed = TokenSchema.parse(await response.json());
      credentials = CredentialsSchema.parse({
        ...credentials, ...refreshed, scopes: refreshed.scope ? refreshed.scope.split(" ") : credentials.scopes,
        refresh_token: refreshed.refresh_token ?? credentials.refresh_token, saved_at: new Date().toISOString(),
      });
      await tx.chatgptProfile.update({ where: { id: profile.id }, data: { credentials: encryptCredentials(credentials, userId) } });
    }
    return { profile, credentials };
  }, { maxWait: 30000, timeout: 90000 });
}

export async function chooseChatgptProfile(userId: string, profileId: string, model: string) {
  const { credentials } = await chatgptSession(userId, profileId);
  const models = await listChatgptModels(credentials.access_token);
  if (!models.some((m) => m.slug === model)) throw new Error("Dieses Modell ist für dein ChatGPT-Konto nicht verfügbar.");
  await db.$transaction(async (tx) => {
    await tx.chatgptProfile.updateMany({ where: { userId }, data: { active: false } });
    await tx.chatgptProfile.update({ where: { id: profileId, userId }, data: { active: true, model } });
  });
}

export async function disconnectChatgptProfile(userId: string, profileId: string) {
  return db.$transaction(async (tx) => {
    // Wait for in-flight refreshes before revoking the latest rotating token.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ChatgptProfile WHERE userId = ${userId} AND id = ${profileId} FOR UPDATE`;
    const profile = rows[0] ? await tx.chatgptProfile.findUnique({ where: { id: rows[0].id } }) : null;
    if (!profile) throw new Error("Verbindung nicht gefunden.");
    let revoked = !profile.credentials;
    if (profile.credentials) {
      const credentials = decryptCredentials(profile.credentials, userId);
      try {
        const discovery = await checkedFetch(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, {}, 5000);
        const endpoint = new URL((await discovery.json()).revocation_endpoint);
        if (endpoint.origin !== CHATGPT_ISSUER) throw new Error("Ungültiger Widerrufs-Endpunkt");
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await checkedFetch(endpoint.href, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: credentials.refresh_token, token_type_hint: "refresh_token", client_id: profile.clientId }) }, 5000);
            revoked = true;
            break;
          } catch {
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      } catch { /* Report unconfirmed revocation without exposing tokens. */ }
    }
    await tx.chatgptProfile.update({ where: { id: profile.id, userId }, data: { active: false, credentials: null } });
    return revoked;
  }, { maxWait: 30000, timeout: 90000 });
}

export async function extractWithChatgpt<S extends z.ZodType>(userId: string, files: { data: Buffer; mimeType: string }[], instruction: string, schema: S): Promise<z.infer<S>> {
  const { profile, credentials } = await chatgptSession(userId);
  if (!profile.model) throw new Error("Bitte unter Einstellungen → KI ein Modell auswählen.");
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
