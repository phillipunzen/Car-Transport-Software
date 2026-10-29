import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique } } }));
import { oauthSignInCheck } from "../src/lib/oauth-linking";

const google = { type: "oidc", provider: "google", providerAccountId: "g-1" };
const verified = { email_verified: true };
const check = (profile: Record<string, unknown> = verified) => oauthSignInCheck({ user: { email: "Opfer@Example.com" }, account: google, profile });

beforeEach(() => vi.resetAllMocks());

describe("OAuth account linking", () => {
  it("leaves credential logins alone", async () => {
    expect(await oauthSignInCheck({ user: {}, account: { type: "credentials", provider: "credentials", providerAccountId: "x" } })).toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("requires the provider to have verified the address", async () => {
    expect(await check({ email_verified: false })).toBe("/login?error=EmailNotVerified");
    expect(await oauthSignInCheck({ user: { email: "a@b.de" }, account: { type: "oidc", provider: "apple", providerAccountId: "a" }, profile: { email_verified: "true" } })).toBe(true);
  });

  it("refuses to link an unverified password account (pre-account takeover)", async () => {
    mocks.findUnique.mockResolvedValue({ emailVerified: null, passwordHash: "hash", accounts: [] });
    expect(await check()).toBe("/login?error=AccountNotLinked");
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "opfer@example.com" } }));
  });

  it("links verified accounts, password-less accounts and already linked providers", async () => {
    mocks.findUnique.mockResolvedValueOnce({ emailVerified: new Date(), passwordHash: "hash", accounts: [] });
    expect(await check()).toBe(true);
    mocks.findUnique.mockResolvedValueOnce({ emailVerified: null, passwordHash: null, accounts: [] });
    expect(await check()).toBe(true);
    mocks.findUnique.mockResolvedValueOnce({ emailVerified: null, passwordHash: "hash", accounts: [{ provider: "google", providerAccountId: "g-1" }] });
    expect(await check()).toBe(true);
    mocks.findUnique.mockResolvedValueOnce(null);
    expect(await check()).toBe(true);
  });
});
