import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sessionUserFor, type SessionUser } from "@/lib/users";

// Every page and API route calls one of these. The user is re-checked on each request,
// so removing someone in Settings (or changing ALLOWED_EMAIL) locks them out immediately.
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return sessionUserFor(session?.user?.email);
}

export async function requirePageUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<NextResponse | null> {
  const user = await currentUser();
  return user ? null : NextResponse.json({ error: "غير مصرح لك. سجّل الدخول أولاً." }, { status: 401 });
}

/** Like requireApiUser, but also gives you who is calling. */
export async function apiUser(): Promise<{ user: SessionUser; denied: null } | { user: null; denied: NextResponse }> {
  const user = await currentUser();
  return user
    ? { user, denied: null }
    : { user: null, denied: NextResponse.json({ error: "غير مصرح لك. سجّل الدخول أولاً." }, { status: 401 }) };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
