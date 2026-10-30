import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(),
  userUpdate: vi.fn(),
  tokenFind: vi.fn(),
  tokenFindFirst: vi.fn(),
  tokenDelete: vi.fn(),
  tokenCreate: vi.fn(),
  sendMail: vi.fn(),
  mailEnabled: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.userFind, update: mocks.userUpdate },
    verificationToken: { findUnique: mocks.tokenFind, findFirst: mocks.tokenFindFirst, deleteMany: mocks.tokenDelete, create: mocks.tokenCreate },
  },
}));
vi.mock("@/lib/mail", () => ({ appUrl: () => "https://app.test", mailEnabled: mocks.mailEnabled, sendMail: mocks.sendMail }));
import { isResetTokenValid, resetPassword, sendPasswordResetMail, startedBeforePasswordChange } from "../src/lib/password-reset";

const TOKEN = "a".repeat(43);
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const record = (extra = {}) => ({ identifier: "reset-password:u1", token: sha(TOKEN), expires: new Date(Date.now() + 60000), ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mailEnabled.mockReturnValue(true);
  mocks.tokenDelete.mockResolvedValue({ count: 1 });
});

describe("password reset mail", () => {
  it("sends a one-hour link and stores only its hash", async () => {
    mocks.userFind.mockResolvedValue({ id: "u1", email: "a@b.de" });
    expect(await sendPasswordResetMail(" A@B.de ")).toBe("sent");
    expect(mocks.userFind).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "a@b.de" } }));
    const link = mocks.sendMail.mock.calls[0][2].match(/reset-password\/([\w-]+)/)[1];
    const stored = mocks.tokenCreate.mock.calls[0][0].data;
    expect(stored.identifier).toBe("reset-password:u1");
    expect(stored.token).toBe(sha(link));
    expect(stored.expires.getTime() - Date.now()).toBeGreaterThan(59 * 60000);
  });

  it("sends nothing for unknown addresses, without SMTP or right after a previous link", async () => {
    mocks.userFind.mockResolvedValue(null);
    expect(await sendPasswordResetMail("x@y.de")).toBe("unknown");
    mocks.userFind.mockResolvedValue({ id: "u1", email: "a@b.de" });
    mocks.tokenFindFirst.mockResolvedValue(record());
    expect(await sendPasswordResetMail("a@b.de")).toBe("throttled");
    mocks.mailEnabled.mockReturnValue(false);
    expect(await sendPasswordResetMail("a@b.de")).toBe("disabled");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("redeeming a reset link", () => {
  it("sets the new password, lifts the lock, verifies the address and marks the change", async () => {
    mocks.tokenFind.mockResolvedValue(record());
    mocks.userFind.mockResolvedValue({ emailVerified: null });
    mocks.userUpdate.mockResolvedValue({ email: "a@b.de" });
    expect(await resetPassword(TOKEN, "neues-passwort")).toBe("a@b.de");
    const { where, data } = mocks.userUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "u1" });
    expect(bcrypt.compareSync("neues-passwort", data.passwordHash)).toBe(true);
    expect(data).toMatchObject({ failedLogins: 0, lockedUntil: null, passwordChangedAt: expect.any(Date), emailVerified: expect.any(Date) });
    expect(mocks.tokenDelete).toHaveBeenCalledWith({ where: { identifier: "reset-password:u1" } });
  });

  it("rejects expired, foreign, malformed and already used links", async () => {
    mocks.tokenFind.mockResolvedValue(record({ expires: new Date(Date.now() - 1) }));
    expect(await resetPassword(TOKEN, "neues-passwort")).toBeNull();
    mocks.tokenFind.mockResolvedValue(record({ identifier: "verify-email:a@b.de" }));
    expect(await resetPassword(TOKEN, "neues-passwort")).toBeNull();
    expect(await isResetTokenValid("../../etc")).toBe(false);
    // Zwei gleichzeitige Einlösungen: nur wer den Link gelöscht hat, setzt das Passwort
    mocks.tokenFind.mockResolvedValue(record());
    mocks.tokenDelete.mockResolvedValue({ count: 0 });
    expect(await resetPassword(TOKEN, "neues-passwort")).toBeNull();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe("sessions after a password change", () => {
  const changed = new Date("2026-10-30T10:00:00Z");
  it("ends sessions that started before the change", () => {
    expect(startedBeforePasswordChange({ authAt: changed.getTime() - 1 }, changed)).toBe(true);
    expect(startedBeforePasswordChange({ authAt: changed.getTime() + 1 }, changed)).toBe(false);
    expect(startedBeforePasswordChange({ authAt: 0 }, null)).toBe(false);
  });
  it("falls back to the issue time for older tokens", () => {
    expect(startedBeforePasswordChange({ iat: changed.getTime() / 1000 - 60 }, changed)).toBe(true);
    expect(startedBeforePasswordChange({}, changed)).toBe(true);
  });
});
