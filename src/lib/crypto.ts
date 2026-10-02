import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

function encryptionKey(): Buffer {
  const raw = requireEnv("TOKEN_ENCRYPTION_KEY");
  if (raw.length < 32) throw new Error("TOKEN_ENCRYPTION_KEY لازم يكون 32 حرف أو أكثر");
  return createHash("sha256").update(raw).digest();
}

function derivedSecret(purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${requireEnv("AUTH_SECRET")}`).digest();
}

// AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url)
export function encryptJSON(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptJSON<T>(payload: string): T {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("صيغة البيانات المشفرة غير صحيحة");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Shared secret between the app and the background function.
export function internalSecret(): string {
  return derivedSecret("internal-function").toString("base64url");
}

// Signed, expiring token for the public media route used by Instagram.
export function signMediaToken(uploadId: string, ttlSeconds = 3600): string {
  const payload = Buffer.from(JSON.stringify({ u: uploadId, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", derivedSecret("media-url")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyMediaToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", derivedSecret("media-url")).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: string; e: number };
    if (typeof u !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null;
    return u;
  } catch {
    return null;
  }
}
