import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
import { CHATGPT_ISSUER, CredentialsSchema, decryptCredentials, encryptCredentials, readChatgptStream, type ChatgptCredentials } from "../src/lib/chatgpt-protocol";

const fakeDb = vi.hoisted(() => ({
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  chatgptProfile: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  chatgptHost: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  chatgptAppProfile: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: fakeDb }));
import { chatgptSession, chooseChatgptProfile, disconnectChatgptProfile, extractWithChatgpt, hasChatgptPlan, importChatgptProfile, sharePersonalChatgptProfile } from "../src/lib/chatgpt";
import { extractVehicle } from "../src/lib/ai";

const credentials: ChatgptCredentials = {
  issuer: CHATGPT_ISSUER, ext_agent_host_id: "urn:uuid:local-host", client_id: "oaiapp_test", subject: "account-1", email: "test@example.com",
  id_token: "id-token", access_token: "access-secret", refresh_token: "refresh-secret", token_type: "Bearer",
  scopes: ["resource.invoke", "chatgpt.tokens.use.direct"], expires_in: 3600, saved_at: new Date().toISOString(), nonce: "a".repeat(32),
};
let identityKey: CryptoKey;
let identityJwk: object;
beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  identityKey = keys.privateKey;
  identityJwk = { ...await exportJWK(keys.publicKey), kid: "identity-test", alg: "RS256", use: "sig" };
});
async function signedCredentials(nonce = credentials.nonce) {
  return { ...credentials, saved_at: new Date().toISOString(), id_token: await new SignJWT({ email: credentials.email, nonce })
    .setProtectedHeader({ alg: "RS256", kid: "identity-test" }).setIssuer(CHATGPT_ISSUER).setAudience(credentials.client_id)
    .setSubject(credentials.subject).setIssuedAt().setExpirationTime("1h").sign(identityKey) };
}
function stream(events: unknown[], chunkSize = 7) {
  const data = new TextEncoder().encode(events.map((event) => `event: message\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(""));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += chunkSize) controller.enqueue(data.slice(i, i + chunkSize)); controller.close(); } }));
}
function ownProfile(tokens = credentials) {
  return { id: "profile-1", userId: "user-1", clientId: tokens.client_id, subject: tokens.subject, email: tokens.email, active: true, model: "available-model", credentials: encryptCredentials(tokens, "chatgpt-app:profile-1") };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHATGPT_TOKEN_SECRET", "test-secret-that-is-at-least-32-characters");
  fakeDb.$transaction.mockImplementation(async (callback: (tx: typeof fakeDb) => unknown) => callback(fakeDb));
  fakeDb.$queryRaw.mockResolvedValue([{ activeProfileId: "profile-1" }]);
  fakeDb.chatgptAppProfile.findUnique.mockResolvedValue(ownProfile());
  fakeDb.chatgptAppProfile.upsert.mockImplementation(async (args) => ({ id: args.create.id, ...args.create }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("ChatGPT credential protection", () => {
  it("encrypts tokens and binds them to one user", () => {
    const encrypted = encryptCredentials(credentials, "user-1");
    expect(encrypted).not.toContain("access-secret");
    expect(decryptCredentials(encrypted, "user-1")).toEqual(credentials);
    expect(() => decryptCredentials(encrypted, "user-2")).toThrow();
    const parts = encrypted.split(".");
    parts[2] = Buffer.alloc(16).toString("base64url");
    expect(() => decryptCredentials(parts.join("."), "user-1")).toThrow();
  });
  it("requires explicit plan permission and an issued client", () => {
    expect(CredentialsSchema.safeParse({ ...credentials, scopes: ["openid"] }).success).toBe(false);
    expect(CredentialsSchema.safeParse({ ...credentials, client_id: "dynamic_agent_client" }).success).toBe(false);
  });
  it("rejects an unsigned identity before storing credentials", async () => {
    await expect(importChatgptProfile(credentials)).rejects.toThrow();
    expect(fakeDb.chatgptAppProfile.upsert).not.toHaveBeenCalled();
  });
  it("validates a signed identity and imports with the VM host rather than the laptop host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith("jwks.json")
      ? { keys: [identityJwk] } : { models: [{ slug: "available-model", display_name: "Available", visibility: "list" }] }), { headers: { "Content-Type": "application/json" } })));
    fakeDb.chatgptHost.upsert.mockResolvedValue({ hostId: "urn:uuid:server-host" });
    fakeDb.chatgptAppProfile.findUnique.mockResolvedValue(null);
    await importChatgptProfile(await signedCredentials());
    const saved = fakeDb.chatgptAppProfile.upsert.mock.calls[0][0];
    expect(saved.create).toMatchObject({ clientId: credentials.client_id });
    expect(decryptCredentials(saved.create.credentials, `chatgpt-app:${saved.create.id}`).ext_agent_host_id).toBe("urn:uuid:server-host");
  });
  it("rejects a signed token with the wrong original nonce", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [identityJwk] }))));
    await expect(importChatgptProfile(await signedCredentials("wrong-nonce"))).rejects.toThrow("Identität");
    expect(fakeDb.chatgptAppProfile.upsert).not.toHaveBeenCalled();
  });
  it("uses only the centrally selected connection; personal accounts are ignored", async () => {
    fakeDb.chatgptHost.findUnique.mockResolvedValue({ activeProfile: null });
    expect(await hasChatgptPlan()).toBe(false);
    fakeDb.chatgptHost.findUnique.mockResolvedValue({ activeProfile: { credentials: "encrypted" } });
    expect(await hasChatgptPlan()).toBe(true);
    const session = await chatgptSession();
    expect(session.profile.id).toBe("profile-1");
    expect(fakeDb.chatgptAppProfile.findUnique).toHaveBeenCalledWith({ where: { id: "profile-1" } });
    expect(fakeDb.chatgptProfile.findFirst).not.toHaveBeenCalled();
  });
  it("only transfers a legacy connection owned by the initiating app admin", async () => {
    fakeDb.chatgptHost.upsert.mockResolvedValue({ hostId: "urn:uuid:server-host" });
    fakeDb.$queryRaw.mockResolvedValueOnce([{ activeProfileId: null }]).mockResolvedValueOnce([]);
    await expect(sharePersonalChatgptProfile("user-2", "someone-elses-profile")).rejects.toThrow("nicht gefunden");
    expect(fakeDb.$queryRaw.mock.calls[1].slice(1)).toEqual(["user-2", "someone-elses-profile"]);
    expect(fakeDb.chatgptAppProfile.upsert).not.toHaveBeenCalled();
  });
  it("re-encrypts a transferred session for the application and clears its personal token copy", async () => {
    fakeDb.chatgptHost.upsert.mockResolvedValue({ hostId: "urn:uuid:server-host" });
    fakeDb.$queryRaw.mockResolvedValueOnce([{ activeProfileId: null }]).mockResolvedValueOnce([{ id: "legacy-1" }]);
    fakeDb.chatgptProfile.findUnique.mockResolvedValue({ ...ownProfile(), id: "legacy-1", credentials: encryptCredentials(credentials, "user-1") });
    await sharePersonalChatgptProfile("user-1", "legacy-1");
    expect(fakeDb.chatgptProfile.update).toHaveBeenCalledWith({ where: { id: "legacy-1" }, data: { credentials: null, active: false } });
    const saved = fakeDb.chatgptAppProfile.upsert.mock.calls[0][0];
    expect(decryptCredentials(saved.update.credentials, "chatgpt-app:profile-1").access_token).toBe(credentials.access_token);
    expect(fakeDb.chatgptHost.update).toHaveBeenCalledWith({ where: { id: "runtime" }, data: { activeProfileId: "profile-1" } });
  });

});

describe("ChatGPT streamed recognition", () => {
  it("decodes split UTF-8/SSE only after successful completion", async () => {
    expect(await readChatgptStream(stream([{ type: "response.output_text.delta", delta: "München €" }, { type: "response.completed" }]))).toBe("München €");
  });
  it("rejects partial, refused and incomplete output", async () => {
    for (const ending of [[], [{ type: "response.incomplete" }], [{ type: "response.refusal.delta" }, { type: "response.completed" }]]) {
      await expect(readChatgptStream(stream([{ type: "response.output_text.delta", delta: "partial" }, ...ending]))).rejects.toThrow();
    }
  });
  it("surfaces plan limits even after output started", async () => {
    await expect(readChatgptStream(stream([{ type: "response.output_text.delta", delta: "partial" }, { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } }]))).rejects.toThrow("Nutzungslimit");
  });
  it("sends images/PDFs using the plan contract and validates results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stream([{ type: "response.output_text.delta", delta: '{"amount":12}' }, { type: "response.completed" }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await extractWithChatgpt([{ data: Buffer.from("pdf"), mimeType: "application/pdf" }, { data: Buffer.from("image"), mimeType: "image/jpeg" }], "Extract", z.object({ amount: z.number() }))).toEqual({ amount: 12 });
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({ model: "available-model", instructions: "Extract", store: false, stream: true });
    expect(body.input[0].content[0]).toMatchObject({ type: "input_file", file_data: "data:application/pdf;base64,cGRm" });
    expect(body.input[0].content[1].type).toBe("input_image");
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(init.headers.Authorization).toBe("Bearer access-secret");
  });
  it("never falls back to a paid provider when ChatGPT fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "paid-provider-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "subscription_sharing_usage_limit_exceeded" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractVehicle([{ data: Buffer.from("photo"), mimeType: "image/jpeg" }], true)).rejects.toThrow("Nutzungslimit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });
});

describe("ChatGPT session lifecycle", () => {
  it("persists rotated refresh tokens together with access token and scopes", async () => {
    fakeDb.chatgptAppProfile.findUnique.mockResolvedValue(ownProfile({ ...credentials, saved_at: "2020-01-01T00:00:00.000Z" }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token_type: "Bearer", access_token: "renewed-access", refresh_token: "renewed-refresh", expires_in: 3600 })));
    vi.stubGlobal("fetch", fetchMock);
    const session = await chatgptSession();
    const saved = fakeDb.chatgptAppProfile.update.mock.calls[0][0];
    expect(decryptCredentials(saved.data.credentials, "chatgpt-app:profile-1")).toMatchObject({ access_token: "renewed-access", refresh_token: "renewed-refresh", scopes: credentials.scopes });
    expect(session.credentials.access_token).toBe("renewed-access");
    expect(fetchMock.mock.calls[0][1].body.get("client_id")).toBe("oaiapp_test");
    expect(fakeDb.$queryRaw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
  });
  it("rejects models outside the account catalog before changing selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ slug: "available-model", display_name: "Available", visibility: "list" }] }))));
    await expect(chooseChatgptProfile("profile-1", "unavailable-model")).rejects.toThrow("nicht verfügbar");
    expect(fakeDb.chatgptHost.update).not.toHaveBeenCalled();
  });
  it("clears local tokens and reports unconfirmed remote revocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    expect(await disconnectChatgptProfile("profile-1")).toBe(false);
    expect(fakeDb.chatgptAppProfile.update).toHaveBeenCalledWith({ where: { id: "profile-1" }, data: { credentials: null } });
    expect(fakeDb.chatgptHost.update).toHaveBeenCalledWith({ where: { id: "runtime" }, data: { activeProfileId: null } });
  });
});
