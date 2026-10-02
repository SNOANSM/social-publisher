import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";
import { createState } from "@/lib/oauth-state";
import { appUrl, graphVersion, optionalEnv } from "@/lib/env";
import { INSTAGRAM_SCOPES, metaApp } from "@/lib/tokens";

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;

  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  const params: Record<string, string> = {
    client_id: metaApp().id,
    redirect_uri: `${appUrl()}/api/connect/instagram/callback`,
    response_type: "code",
    state: await createState("instagram"),
  };
  // "Facebook Login for Business" apps use a configuration ID instead of a scope list.
  const configId = optionalEnv("META_CONFIG_ID");
  if (configId) params.config_id = configId;
  else params.scope = INSTAGRAM_SCOPES.join(",");
  url.search = new URLSearchParams(params).toString();
  return NextResponse.redirect(url);
}
