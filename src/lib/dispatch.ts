import { appUrl } from "./env";
import { internalSecret } from "./crypto";
import { getResult, setResult } from "./posts";
import type { Platform, PlatformResult } from "./types";

// Calls the Netlify Background Function, which answers 202 right away and keeps
// working for up to 15 minutes. Used by the API routes and by the scheduler function,
// so it must not import anything from Next.js.
export async function dispatchPublish(postId: string, platform: Platform, result: PlatformResult): Promise<void> {
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
