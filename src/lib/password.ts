import { scryptSync, timingSafeEqual } from "node:crypto";

// Format (no "$" so it is safe in .env files): scrypt.<N>.<r>.<p>.<salt>.<hash>  (base64url)
// Created by `npm run set-password` (scripts/set-password.mjs).
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.trim().split(".");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
