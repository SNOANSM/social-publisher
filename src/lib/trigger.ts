import { after } from "next/server";
import { appUrl } from "./env";
import { internalSecret } from "./crypto";
import { getResult, setResult } from "./posts";
import { runPublish } from "./publisher";
import type { Platform, PlatformResult } from "./types";

// Starts publishing for one platform.
//
// Production: calls the Netlify Background Function, which answers 202 right away and
// keeps working for up to 15 minutes. The UI polls the result stored in Blobs.
//
// Local `netlify dev`: the CLI's local runner fails to load @netlify/blobs inside
// background functions, so the same job runs in the (long-lived) dev server process instead.
export async function triggerPublish(postId: string, platform: Platform, result: PlatformResult): Promise<void> {
  if (process.env.NETLIFY_DEV === "true") {
    after(() => runPublish(postId, platform, result.attemptId).catch((err) => console.error("[publish:local]", err)));
    return;
  }

  try {
    const res = await fetch(`${appUrl()}/.netlify/functions/publish-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret() },
      body: JSON.stringify({ postId, platform, attemptId: result.attemptId }),
    });
    if (res.status !== 202 && !res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const latest = await getResult(postId, platform);
    if (latest?.attemptId === result.attemptId && latest.status === "pending") {
      await setResult(postId, platform, {
        ...latest,
        status: "failed",
        error: "تعذّر تشغيل عملية النشر في الخلفية. تأكد من APP_URL وجرّب مرة ثانية.",
        errorDetails: err instanceof Error ? err.message : String(err),
        finishedAt: new Date().toISOString(),
      });
    }
  }
}
