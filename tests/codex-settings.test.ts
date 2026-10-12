import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), configured: vi.fn(), status: vi.fn(), host: vi.fn() }));
vi.mock("@/lib/org", () => ({ requireCtx: async () => ({ user: { id: "user-1", email: "owner@example.invalid" }, role: "OWNER", org: { moduleFleet: false } }) }));
vi.mock("@/lib/chatgpt-admin", () => ({ canManageAppAi: mocks.admin }));
vi.mock("@/lib/chatgpt", () => ({ chatgptHostId: async () => "host", chatgptSession: vi.fn(), listChatgptModels: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { chatgptHost: { findUnique: mocks.host }, chatgptAppProfile: { findMany: async () => [] }, chatgptProfile: { findMany: async () => [] } } }));
vi.mock("@/lib/codex", () => ({ codexConfigured: mocks.configured, completeCodexLogin: mocks.status }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../src/app/(app)/settings/ai/actions", () => ({ disconnectConnection: vi.fn(), importConnection: vi.fn(), selectConnection: vi.fn(), sharePersonalConnection: vi.fn() }));
vi.mock("../src/app/(app)/settings/ai/codex-actions", () => ({ disconnectCodexConnection: vi.fn(), selectCodexModel: vi.fn(), cancelDeviceLogin: vi.fn(), pollDeviceLogin: vi.fn(), startDeviceLogin: vi.fn() }));
vi.mock("@/components/action-form", () => ({ ActionForm: ({ children }: { children: ReactNode }) => createElement("form", null, children) }));
vi.mock("@/components/submit-button", () => ({ SubmitButton: ({ children }: { children: ReactNode }) => createElement("button", null, children) }));
import AiSettingsPage from "../src/app/(app)/settings/ai/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.configured.mockReturnValue(false);
  mocks.host.mockResolvedValue({ aiProvider: "chatgpt", activeProfile: null });
});

it("shows the real device-login control to app admins even when configuration is missing", async () => {
  const html = renderToStaticMarkup(await AiSettingsPage());
  expect(html).toContain("Codex per Device Code verbinden");
  expect(html).toContain("Server-Schlüssel");
  expect(mocks.status).not.toHaveBeenCalled();
});

it("keeps the login control available when the Codex service cannot be reached", async () => {
  mocks.configured.mockReturnValue(true);
  mocks.status.mockRejectedValue(new Error("Offline"));
  const html = renderToStaticMarkup(await AiSettingsPage());
  expect(html).toContain("Codex per Device Code verbinden");
  expect(html).toContain("nicht erreichbar");
});

it("does not expose global account management to an ordinary tenant owner", async () => {
  mocks.admin.mockResolvedValue(false);
  const html = renderToStaticMarkup(await AiSettingsPage());
  expect(html).not.toContain("Codex per Device Code verbinden");
  expect(html).toContain("App-Administrator");
});
