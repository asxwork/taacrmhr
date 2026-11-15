// Two-step login codes (RFC 6238 TOTP, as used by Google / Microsoft Authenticator): 6 digits, 30-second steps.
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret: string) {
  let bits = "";
  for (const c of secret.replace(/[\s=]/g, "").toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, "0"); }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", decode(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

/** Accepts the current code and one step either side (phone clocks drift a little). */
export function verifyTotp(secret: string, code: string) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  return [-1, 0, 1].some((d) => totpCode(secret, Date.now() + d * 30_000) === c);
}

export function otpauthUrl(secret: string, account: string, issuer = "AMS") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
}

/** Ten one-time backup codes like "7KQ2-M9XD" for when the phone is lost. */
export function newRecoveryCodes(n = 10) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = randomBytes(8);
    let c = "";
    for (const x of b) c += B32[x % 32];
    out.push(`${c.slice(0, 4)}-${c.slice(4, 8)}`);
  }
  return out;
}

/** Uses a backup code: the list without it, or null when it isn't one of them. */
export function spendRecoveryCode(codes: string[], input: string) {
  const want = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const i = codes.findIndex((c) => c.replace("-", "") === want);
  return i < 0 ? null : codes.filter((_, j) => j !== i);
}
