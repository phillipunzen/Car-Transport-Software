import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Zwei-Faktor-Anmeldung nach RFC 6238 (TOTP, 30 s, 6 Stellen, SHA-1) – kompatibel mit Google Authenticator, Microsoft Authenticator, 1Password, iOS-Passwörter. */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, time = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Prüft den Code mit ±1 Zeitfenster (Uhrabweichung). */
export function verifyTotp(secret: string, code: string, time = Date.now()) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((w) => {
    const expected = Buffer.from(totpCode(secret, time + w * 30000));
    return timingSafeEqual(expected, Buffer.from(c));
  });
}

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// Wiederherstellungscodes (einmalig nutzbar), gespeichert nur als Hash
const hashCode = (c: string) => createHash("sha256").update(c.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

export function newRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

/** Gibt die verbleibenden Hashes zurück, wenn der Code gültig war – sonst null. */
export function consumeRecoveryCode(hashes: unknown, code: string): string[] | null {
  const list = Array.isArray(hashes) ? (hashes as string[]) : [];
  const h = hashCode(code);
  return list.includes(h) ? list.filter((x) => x !== h) : null;
}
