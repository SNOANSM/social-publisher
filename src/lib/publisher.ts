// Runs inside the Netlify Background Function (up to 15 minutes).
import { cleanupIfDone, getPost, getPostWithResults, getResult, postItems, setResult } from "./posts";
import { getUpload } from "./uploads";
import { toPublishError, PublishError } from "./errors";
import { publishToYouTube } from "./youtube";
import { publishToInstagram } from "./instagram";
import type { Platform, PlatformResult } from "./types";

export async function runPublish(postId: string, platform: Platform, attemptId: string): Promise<void> {
  const [post, initial] = await Promise.all([getPost(postId), getResult(postId, platform)]);
  if (!post || !initial || initial.attemptId !== attemptId) return; // unknown or superseded attempt

  if (initial.status !== "pending") {
    // Netlify retries a background function that crashed. Never publish twice:
    // if this attempt was already running, mark it as failed instead of starting over.
    if (initial.status === "processing") {
      await setResult(postId, platform, {
        ...initial,
        status: "failed",
        error: "توقفت عملية النشر بشكل غير متوقع. تأكد من حسابك على المنصة قبل إعادة المحاولة عشان ما يتكرر النشر.",
        finishedAt: new Date().toISOString(),
      });
    }
    return;
  }

  let current: PlatformResult = {
    ...initial,
    status: "processing",
    step: "بدء النشر",
    progress: 0,
    error: undefined,
    errorDetails: undefined,
    startedAt: new Date().toISOString(),
  };
  await setResult(postId, platform, current);

  let lastWrite = 0;
  const progress = async (step: string, pct?: number) => {
    const stepChanged = step !== current.step;
    current = { ...current, step, progress: pct ?? current.progress };
    // Throttle writes; step changes are always written.
    if (stepChanged || Date.now() - lastWrite > 1500) {
      lastWrite = Date.now();
      await setResult(postId, platform, current);
    }
  };

  try {
    const uploads = await Promise.all(postItems(post).map((item) => getUpload(item.uploadId)));
    if (uploads.some((u) => !u || !u.complete)) throw new PublishError("الملف المرفوع غير موجود أو انحذف. ارفعه من جديد.");
    const files = uploads as NonNullable<(typeof uploads)[number]>[];
    const { id, url } =
      platform === "youtube" ? await publishToYouTube(post, files[0], progress) : await publishToInstagram(post, files, progress);
    current = {
      ...current,
      status: "success",
      step: "تم النشر",
      progress: 100,
      remoteId: id,
      url,
      finishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const e = toPublishError(err);
    console.error(`[publish] ${platform} failed for ${postId}:`, e.details ?? e.message);
    current = {
      ...current,
      status: "failed",
      error: e.userMessage,
      errorDetails: e.details?.slice(0, 1000),
      finishedAt: new Date().toISOString(),
    };
  }
  await setResult(postId, platform, current);

  const latest = await getPostWithResults(postId);
  if (latest) await cleanupIfDone(latest).catch((err) => console.error("[publish] cleanup failed", err));
}
