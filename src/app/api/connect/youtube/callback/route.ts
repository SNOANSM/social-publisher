import { requireApiUser } from "@/lib/session";
import { consumeState, settingsRedirect } from "@/lib/oauth-state";
import { appUrl } from "@/lib/env";
import { YOUTUBE_SCOPES, googleClient, saveYouTubeTokens } from "@/lib/tokens";

export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  if (!(await consumeState("youtube", params.get("state")))) {
    return settingsRedirect({ error: "انتهت صلاحية طلب الربط أو أنه غير صالح. جرّب مرة ثانية." });
  }
  if (params.get("error")) return settingsRedirect({ error: "تم إلغاء ربط يوتيوب." });
  const code = params.get("code");
  if (!code) return settingsRedirect({ error: "ما وصل كود التفويض من Google." });

  try {
    const { id, secret } = googleClient();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: `${appUrl()}/api/connect/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      return settingsRedirect({ error: `فشل ربط يوتيوب: ${tokens.error_description ?? tokens.error ?? tokenRes.status}` });
    }
    if (!tokens.refresh_token) {
      return settingsRedirect({ error: "Google ما رجّع refresh token. احذف صلاحية التطبيق من حسابك في Google وأعد الربط." });
    }
    const granted = String(tokens.scope ?? "").split(" ");
    if (!granted.includes(YOUTUBE_SCOPES[0])) {
      return settingsRedirect({ error: "لازم توافق على صلاحية رفع الفيديوهات (youtube.upload) أثناء الربط." });
    }

    const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const channels = await channelRes.json();
    const channel = channels.items?.[0];
    if (!channelRes.ok || !channel) {
      return settingsRedirect({ error: "الحساب اللي اخترته ما عنده قناة يوتيوب." });
    }

    await saveYouTubeTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      channelId: channel.id,
      channelTitle: channel.snippet?.title ?? channel.id,
      connectedAt: new Date().toISOString(),
    });
    return settingsRedirect({ connected: "youtube" });
  } catch (err) {
    console.error("[connect/youtube]", err);
    return settingsRedirect({ error: "صار خطأ أثناء ربط يوتيوب. جرّب مرة ثانية." });
  }
}
