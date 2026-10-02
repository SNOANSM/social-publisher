import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";
import { createState } from "@/lib/oauth-state";
import { appUrl } from "@/lib/env";
import { YOUTUBE_SCOPES, googleClient } from "@/lib/tokens";

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: googleClient().id,
    redirect_uri: `${appUrl()}/api/connect/youtube/callback`,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline", // gives us a refresh token
    prompt: "consent select_account", // always return a refresh token, let me pick the channel account
    state: await createState("youtube"),
  }).toString();
  return NextResponse.redirect(url);
}
