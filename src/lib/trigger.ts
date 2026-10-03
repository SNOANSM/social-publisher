import { after } from "next/server";
import { dispatchPublish } from "./dispatch";
import { runPublish } from "./publisher";
import type { Platform, PlatformResult } from "./types";

// Starts publishing for one platform from a Next.js route.
//
// Production: the Netlify Background Function does the work (see dispatch.ts).
// Local `netlify dev`: the CLI's local runner fails to load @netlify/blobs inside
// background functions, so the same job runs in the (long-lived) dev server process instead.
export async function triggerPublish(postId: string, platform: Platform, result: PlatformResult): Promise<void> {
  if (process.env.NETLIFY_DEV === "true") {
    after(() => runPublish(postId, platform, result.attemptId).catch((err) => console.error("[publish:local]", err)));
    return;
  }
  await dispatchPublish(postId, platform, result);
}
