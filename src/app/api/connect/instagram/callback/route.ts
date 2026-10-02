import { requireApiUser } from "@/lib/session";
import { consumeState, settingsRedirect } from "@/lib/oauth-state";
import { appUrl } from "@/lib/env";
import { PublishError } from "@/lib/errors";
import {
  buildInstagramTokens,
  exchangeForLongLivedToken,
  getInstagramTokens,
  graphGet,
  metaApp,
  saveInstagramTokens,
} from "@/lib/tokens";

export async function GET(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  if (!(await consumeState("instagram", params.get("state")))) {
    return settingsRedirect({ error: "انتهت صلاحية طلب الربط أو أنه غير صالح. جرّب مرة ثانية." });
  }
  if (params.get("error")) return settingsRedirect({ error: "تم إلغاء ربط انستقرام." });
  const code = params.get("code");
  if (!code) return settingsRedirect({ error: "ما وصل كود التفويض من فيسبوك." });

  try {
    const { id, secret } = metaApp();
    const short = await graphGet<{ access_token: string }>("oauth/access_token", {
      client_id: id,
      client_secret: secret,
      redirect_uri: `${appUrl()}/api/connect/instagram/callback`,
      code,
    });
    const longLived = await exchangeForLongLivedToken(short.access_token);
    const tokens = await buildInstagramTokens(longLived, await getInstagramTokens());
    await saveInstagramTokens(tokens);
    return settingsRedirect({ connected: "instagram" });
  } catch (err) {
    console.error("[connect/instagram]", err);
    const message = err instanceof PublishError ? err.userMessage : "صار خطأ أثناء ربط انستقرام. جرّب مرة ثانية.";
    return settingsRedirect({ error: message });
  }
}
