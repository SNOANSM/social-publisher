import { dataStore } from "./stores";
import { isAllowedEmail, optionalEnv } from "./env";
import { hashPassword, verifyPassword } from "./password";

// People who can log in:
//  - the owner: ALLOWED_EMAIL (password from ADMIN_PASSWORD_HASH, or a newer one changed in Settings)
//  - extra users the owner adds in Settings (stored in Blobs, password as an scrypt hash)
// Everyone shares the same linked accounts, posts and plan.

export interface AppUser {
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: string;
  addedBy: string;
}

export interface SessionUser {
  email: string;
  name: string;
  isOwner: boolean;
}

// base64url keeps the key free of "@", "%" and "/" (Blobs listings return decoded keys).
const userKey = (email: string) => `users/${Buffer.from(email.trim().toLowerCase()).toString("base64url")}`;
const OWNER_PASSWORD_KEY = "auth/owner-password";

export const isOwner = (email: string | null | undefined) => isAllowedEmail(email);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && email.length <= 200;
}

export async function getUser(email: string): Promise<AppUser | null> {
  if (!isValidEmail(email)) return null;
  return (await dataStore().get(userKey(email), { type: "json" })) as AppUser | null;
}

export async function listUsers(): Promise<AppUser[]> {
  const store = dataStore();
  const { blobs } = await store.list({ prefix: "users/" });
  const users = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }) as Promise<AppUser | null>));
  return users.filter((u): u is AppUser => !!u).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addUser(email: string, name: string, password: string, addedBy: string): Promise<void> {
  const user: AppUser = {
    email: normalizeEmail(email),
    name: name.trim() || undefined,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    addedBy,
  };
  await dataStore().setJSON(userKey(email), user);
}

export async function removeUser(email: string): Promise<void> {
  await dataStore().delete(userKey(email));
}

/** Who this email is, or null if it may not log in. Checked on every request. */
export async function sessionUserFor(email: string | null | undefined): Promise<SessionUser | null> {
  if (!email) return null;
  if (isOwner(email)) return { email: normalizeEmail(email), name: "أنت", isOwner: true };
  const user = await getUser(email);
  return user ? { email: user.email, name: user.name ?? user.email, isOwner: false } : null;
}

/** Checks a login. Returns the normalized email when the password is right. */
export async function checkPassword(email: string, password: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (isOwner(normalized)) {
    const changed = (await dataStore().get(OWNER_PASSWORD_KEY, { type: "text" })) as string | null;
    const hash = changed ?? optionalEnv("ADMIN_PASSWORD_HASH");
    return hash && verifyPassword(password, hash) ? normalized : null;
  }
  const user = await getUser(normalized);
  // Hash something anyway so unknown emails take the same time as wrong passwords.
  const ok = verifyPassword(password, user?.passwordHash ?? "scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  return user && ok ? normalized : null;
}

export async function changePassword(email: string, newPassword: string): Promise<void> {
  const hash = hashPassword(newPassword);
  if (isOwner(email)) {
    await dataStore().set(OWNER_PASSWORD_KEY, hash);
    return;
  }
  const user = await getUser(email);
  if (user) await dataStore().setJSON(userKey(email), { ...user, passwordHash: hash });
}
