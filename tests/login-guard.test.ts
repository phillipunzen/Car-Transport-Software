import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { update: mocks.update } } }));
import { checkPassword, isLocked, lockDuration, recordFailedLogin, resetFailedLogins } from "../src/lib/login-guard";

const hash = bcrypt.hashSync("richtig", 4);
const user = (extra = {}) => ({ id: "u1", passwordHash: hash, failedLogins: 0, lockedUntil: null as Date | null, ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ failedLogins: 1 });
});

describe("login guard", () => {
  it("locks from the 10th failure and doubles up to one hour", () => {
    expect(lockDuration(9)).toBe(0);
    expect(lockDuration(10)).toBe(15 * 60000);
    expect(lockDuration(11)).toBe(30 * 60000);
    expect(lockDuration(12)).toBe(60 * 60000);
    expect(lockDuration(50)).toBe(60 * 60000);
  });

  it("does not check the password of a locked account", async () => {
    const locked = user({ lockedUntil: new Date(Date.now() + 60000) });
    expect(isLocked(locked)).toBe(true);
    expect(await checkPassword(locked, "richtig")).toBe("locked");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("counts wrong passwords and sets a lock at the threshold", async () => {
    expect(await checkPassword(user(), "falsch")).toBe("wrong");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    mocks.update.mockReset().mockResolvedValue({ failedLogins: 10 });
    await recordFailedLogin("u1");
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { lockedUntil: expect.any(Date) } }));
  });

  it("accepts the right password and resets the counter only when needed", async () => {
    expect(await checkPassword(user(), "richtig")).toBe("ok");
    await resetFailedLogins(user());
    expect(mocks.update).not.toHaveBeenCalled();
    await resetFailedLogins(user({ failedLogins: 3 }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { failedLogins: 0, lockedUntil: null } });
  });
});
