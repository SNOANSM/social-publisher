import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/env";

// Every page and API route calls one of these. The email is re-checked on each
// request, so changing ALLOWED_EMAIL locks out existing sessions immediately.
export async function currentUser() {
  const session = await auth();
  const email = session?.user?.email;
  return email && isAllowedEmail(email) ? session.user : null;
}

export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser(): Promise<NextResponse | null> {
  const user = await currentUser();
  return user ? null : NextResponse.json({ error: "غير مصرح لك. سجّل الدخول أولاً." }, { status: 401 });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
