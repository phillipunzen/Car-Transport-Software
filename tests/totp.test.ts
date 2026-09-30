import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newRecoveryCodes, totpCode, consumeRecoveryCode, verifyTotp } from "../src/lib/totp";

// RFC 6238 Anhang B: Schlüssel "12345678901234567890" (SHA-1), 8 Stellen
const secret = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("Base32 hin und zurück", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("RFC-6238-Testvektoren", () => {
    expect(totpCode(secret, 59_000, 30, 8)).toBe("94287082");
    expect(totpCode(secret, 1111111109_000, 30, 8)).toBe("07081804");
    expect(totpCode(secret, 1234567890_000, 30, 8)).toBe("89005924");
    expect(totpCode(secret, 20000000000_000, 30, 8)).toBe("65353130");
  });
  it("Prüfung mit Zeitfenster", () => {
    const t = 1_700_000_000_000;
    const code = totpCode(secret, t);
    expect(verifyTotp(secret, code, t)).toBe(true);
    expect(verifyTotp(secret, code, t + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, t + 90_000)).toBe(false);
    expect(verifyTotp(secret, "12345", t)).toBe(false);
  });
  it("Wiederherstellungscodes sind einmalig", () => {
    const { codes, hashes } = newRecoveryCodes(3);
    const rest = consumeRecoveryCode(hashes, codes[1].toLowerCase());
    expect(rest).toHaveLength(2);
    expect(consumeRecoveryCode(rest, codes[1])).toBeNull();
  });
});
