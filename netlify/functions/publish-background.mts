import { internalSecret, safeEqual } from "../../src/lib/crypto";
import { runPublish } from "../../src/lib/publisher";
import { isValidPostId } from "../../src/lib/posts";
import type { Platform } from "../../src/lib/types";

// Background function (the "-background" suffix gives it up to 15 minutes).
// Only the app itself can call it: requests must carry the internal secret.
export default async function publishBackground(req: Request) {
  if (req.method !== "POST") return;
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!safeEqual(secret, internalSecret())) {
    console.warn("[publish-background] rejected request without a valid secret");
    return;
  }

  let payload: { postId?: string; platform?: string; attemptId?: string };
  try {
    payload = await req.json();
  } catch {
    return;
  }
  const { postId, platform, attemptId } = payload;
  if (!postId || !isValidPostId(postId) || !attemptId || (platform !== "youtube" && platform !== "instagram")) return;

  try {
    await runPublish(postId, platform as Platform, attemptId);
  } catch (err) {
    // Never throw: Netlify would retry the function and could publish twice.
    console.error("[publish-background] unexpected error", err);
  }
}
