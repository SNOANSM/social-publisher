import { createHash } from "node:crypto";
import { dataStore } from "./stores";

// Blocks an IP after too many wrong passwords, to stop password guessing.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface Failures {
  count: number;
  firstAt: number;
}

function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const keyFor = (request: Request) => `auth/failures/${createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32)}`;

async function read(key: string): Promise<Failures | null> {
  const value = (await dataStore().get(key, { type: "json" })) as Failures | null;
  return value && Date.now() - value.firstAt < WINDOW_MS ? value : null;
}

export async function isBlocked(request: Request): Promise<boolean> {
  const failures = await read(keyFor(request));
  return !!failures && failures.count >= MAX_FAILURES;
}

export async function recordFailure(request: Request): Promise<void> {
  const key = keyFor(request);
  const current = await read(key);
  await dataStore().setJSON(key, current ? { ...current, count: current.count + 1 } : { count: 1, firstAt: Date.now() });
}

export async function clearFailures(request: Request): Promise<void> {
  await dataStore().delete(keyFor(request));
}
