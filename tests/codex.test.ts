import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ findHost: vi.fn(), updateHost: vi.fn(), updateHosts: vi.fn(), hostId: vi.fn(), hasPlan: vi.fn(), chatgptExtract: vi.fn(), ctx: vi.fn(), admin: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { chatgptHost: { findUnique: mocks.findHost, update: mocks.updateHost, updateMany: mocks.updateHosts } } }));
vi.mock("@/lib/chatgpt", () => ({ chatgptHostId: mocks.hostId, hasChatgptPlan: mocks.hasPlan, extractWithChatgpt: mocks.chatgptExtract }));
vi.mock("@/lib/org", () => ({ requireCtx: mocks.ctx }));
vi.mock("@/lib/chatgpt-admin", () => ({ canManageAppAi: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { completeCodexLogin, extractWithCodex, chooseCodexModel, startCodexLogin } from "../src/lib/codex";
import { recognizeVehicle, recognizeReceipt } from "../src/lib/recognition";
import { cancelDeviceLogin, disconnectCodexConnection, pollDeviceLogin, selectCodexModel, startDeviceLogin } from "../src/app/(app)/settings/ai/codex-actions";

const login = { loginId: "login-1", verificationUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-1234", status: "completed", expiresAt: Date.now() + 900000 };
const status = { connected: true, email: "admin@example.com", planType: "plus", models: [{ model: "vision-model", displayName: "Vision", isDefault: true }], login };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CODEX_BRIDGE_URL", "http://codex:3100");
  vi.stubEnv("CODEX_BRIDGE_SECRET", "test-bridge-secret-at-least-32-characters");
  mocks.findHost.mockResolvedValue({ aiProvider: "codex", codexModel: "vision-model" });
  mocks.ctx.mockResolvedValue({ user: { id: "tenant-owner", email: "owner@example.com" } });
  mocks.admin.mockResolvedValue(false);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Codex device login", () => {
  it("rejects every management action before contacting the Codex service", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const results = await Promise.all([startDeviceLogin(true), pollDeviceLogin(), cancelDeviceLogin("other-login"), selectCodexModel(undefined, new FormData()), disconnectCodexConnection()]);
    for (const result of results) expect(result?.error).toContain("App-Administratoren");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.updateHost).not.toHaveBeenCalled();
  });
  it("requires explicit global consent", async () => {
    mocks.admin.mockResolvedValue(true);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await startDeviceLogin(false)).error).toContain("bestätigen");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("starts only the documented device-code flow and stores its durable login ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...login, status: "pending" }))));
    const result = await startCodexLogin();
    expect(result.userCode).toBe("ABCD-1234");
    expect(mocks.updateHost).toHaveBeenCalledWith({ where: { id: "runtime" }, data: { codexLoginId: "login-1" } });
  });
  it("rejects unexpected verification URLs instead of displaying them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...login, verificationUrl: "https://example.invalid" }))));
    await expect(startCodexLogin()).rejects.toThrow();
    expect(mocks.updateHost).not.toHaveBeenCalled();
  });
  it("activates completed login only if its pending ID still matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(status))));
    await completeCodexLogin();
    expect(mocks.updateHosts).toHaveBeenCalledWith({ where: { id: "runtime", codexLoginId: "login-1" }, data: { aiProvider: "codex", codexModel: "vision-model", codexLoginId: null } });
  });
  it("does not activate pending, failed, or disconnected login", async () => {
    for (const state of ["pending", "failed", "expired"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...status, login: { ...login, status: state } }))));
      await completeCodexLogin();
    }
    expect(mocks.updateHosts).not.toHaveBeenCalled();
  });
  it("rejects a model outside the account catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(status))));
    await expect(chooseCodexModel("unavailable")).rejects.toThrow("Bildmodell");
    expect(mocks.updateHost).not.toHaveBeenCalled();
  });
});

describe("shared Codex recognition", () => {
  it("sends only this request's normalized image, schema and selected model", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { plate: "B AB 123" } })));
    vi.stubGlobal("fetch", fetch);
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: "white" } }).png().toBuffer();
    expect(await extractWithCodex([{ data: image, mimeType: "image/png" }], "extract", z.object({ plate: z.string() }))).toEqual({ plate: "B AB 123" });
    const [url, init] = fetch.mock.calls[0];
    expect(url.href).toBe("http://codex:3100/extract");
    expect(init.headers.Authorization).toBe("Bearer test-bridge-secret-at-least-32-characters");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("vision-model");
    expect(body.files).toHaveLength(1);
    expect(body.files[0].mimeType).toBe("image/jpeg");
    expect((await sharp(Buffer.from(body.files[0].data, "base64")).metadata()).format).toBe("jpeg");
    expect(body.schema.type).toBe("object");
    expect(body).not.toHaveProperty("previous_response_id");
  });
  it("rejects invalid model data before it reaches an order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { plate: 123 } }))));
    await expect(extractWithCodex([{ data: Buffer.from("pdf"), mimeType: "application/pdf" }], "extract", z.object({ plate: z.string() }))).rejects.toThrow("gültigen Daten");
  });
  it("keeps the central Codex route for vehicles and receipts on failure, even with a paid API configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "must-not-be-used");
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const pdf = { data: Buffer.from("pdf"), mimeType: "application/pdf" };
    await expect(recognizeVehicle([pdf])).rejects.toThrow("Codex");
    await expect(recognizeReceipt(pdf)).rejects.toThrow("Codex");
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) expect(url.href).toBe("http://codex:3100/extract");
    expect(mocks.chatgptExtract).not.toHaveBeenCalled();
  });
});
