import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing for email + password sign-in (ADR 0007): scrypt with a random 16-byte salt.
 * Stored as `scrypt$N$r$p$salt$hash` (base64url) so the cost can be raised later without breaking
 * existing hashes. Node's built-in crypto — no extra dependency.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A password the system generates for new accounts and resets: 14 characters, easy to type. */
export function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // no l/I/O
  const digits = "23456789";
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(digits), pick(digits), ...Array.from({ length: 12 }, () => pick(letters + digits))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return `${chars.slice(0, 7).join("")}-${chars.slice(7).join("")}`;
}
