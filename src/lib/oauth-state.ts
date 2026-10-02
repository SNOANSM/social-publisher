import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomId, safeEqual } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

// CSRF protection for the "link account" OAuth flows.
const cookieName = (platform: string) => `oauth_state_${platform}`;

export async function createState(platform: string): Promise<string> {
  const state = randomId(24);
  (await cookies()).set(cookieName(platform), state, {
    httpOnly: true,
    secure: appUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/connect",
    maxAge: 600,
  });
  return state;
}

export async function consumeState(platform: string, received: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(cookieName(platform))?.value;
  store.delete({ name: cookieName(platform), path: "/api/connect" });
  return !!expected && !!received && safeEqual(expected, received);
}

export function settingsRedirect(params: Record<string, string>) {
  const url = new URL(`${appUrl()}/settings`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}
