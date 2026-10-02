// Environment access shared by Next.js routes and Netlify functions.

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`متغير البيئة ${name} غير موجود`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function appUrl(): string {
  return requireEnv("APP_URL").replace(/\/+$/, "");
}

export function graphVersion(): string {
  return optionalEnv("META_GRAPH_VERSION") ?? "v25.0";
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = optionalEnv("ALLOWED_EMAIL");
  // Fail closed: if ALLOWED_EMAIL is missing nobody gets in.
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed.toLowerCase();
}
