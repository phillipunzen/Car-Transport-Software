import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstUser: vi.fn(), requireCtx: vi.fn(), importProfile: vi.fn(), selectProfile: vi.fn(), disconnectProfile: vi.fn(), sharePersonal: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { user: { findFirst: mocks.firstUser } } }));
vi.mock("@/lib/org", () => ({ requireCtx: mocks.requireCtx }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/chatgpt", () => ({ importChatgptProfile: mocks.importProfile, chooseChatgptProfile: mocks.selectProfile, disconnectChatgptProfile: mocks.disconnectProfile, sharePersonalChatgptProfile: mocks.sharePersonal }));
import { canManageAppAi } from "../src/lib/chatgpt-admin";
import { disconnectConnection, importConnection, selectConnection, sharePersonalConnection } from "../src/app/(app)/settings/ai/actions";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHATGPT_APP_ADMIN_EMAILS", "");
  mocks.firstUser.mockResolvedValue({ id: "first-user" });
  mocks.requireCtx.mockResolvedValue({ user: { id: "new-tenant-owner", email: "owner@example.com" }, role: "OWNER", orgId: "tenant-2" });
});
afterEach(() => vi.unstubAllEnvs());

describe("app AI administration", () => {
  it("bootstraps the first account without granting permissions to a new tenant owner", async () => {
    expect(await canManageAppAi({ id: "first-user", email: "first@example.com" })).toBe(true);
    expect(await canManageAppAi({ id: "new-tenant-owner", email: "owner@example.com" })).toBe(false);
  });
  it("uses the server allowlist instead of the first-account fallback when configured", async () => {
    vi.stubEnv("CHATGPT_APP_ADMIN_EMAILS", " ADMIN@example.com, second@example.com ");
    expect(await canManageAppAi({ id: "admin-user", email: "admin@example.com" })).toBe(true);
    expect(await canManageAppAi({ id: "first-user", email: "first@example.com" })).toBe(false);
    expect(mocks.firstUser).not.toHaveBeenCalled();
  });
  it("rejects every management action before reading credentials or mutating shared state", async () => {
    for (const action of [importConnection, selectConnection, disconnectConnection, sharePersonalConnection]) {
      const result = await action(undefined, new FormData());
      expect(result?.error).toContain("App-Administratoren");
    }
    expect(mocks.importProfile).not.toHaveBeenCalled();
    expect(mocks.selectProfile).not.toHaveBeenCalled();
    expect(mocks.disconnectProfile).not.toHaveBeenCalled();
    expect(mocks.sharePersonal).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("lets an app admin choose one model for all tenants", async () => {
    vi.stubEnv("CHATGPT_APP_ADMIN_EMAILS", "owner@example.com");
    const form = new FormData();
    form.set("profileId", "app-profile");
    form.set("model", "account-model");
    expect((await selectConnection(undefined, form))?.ok).toContain("ganze App");
    expect(mocks.selectProfile).toHaveBeenCalledWith("app-profile", "account-model");
  });
  it("requires explicit sharing on import and transfers only the initiating admin's personal profile", async () => {
    vi.stubEnv("CHATGPT_APP_ADMIN_EMAILS", "owner@example.com");
    const form = new FormData();
    form.set("profileId", "legacy-profile");
    expect((await sharePersonalConnection(undefined, form))?.error).toContain("bestätigen");
    expect(mocks.sharePersonal).not.toHaveBeenCalled();
    form.set("consent", "on");
    expect((await sharePersonalConnection(undefined, form))?.ok).toContain("alle Benutzer");
    expect(mocks.sharePersonal).toHaveBeenCalledWith("new-tenant-owner", "legacy-profile");
  });
});
