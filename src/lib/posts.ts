import { dataStore } from "./stores";
import { randomId } from "./crypto";
import { deleteUpload } from "./uploads";
import { type MediaItem, type Platform, type PlatformResult, type Post, type PostWithResults } from "./types";

// Each platform writes its own result key, so two background functions
// running in parallel never overwrite each other's progress.
const postKey = (id: string) => `posts/${id}`;
const resultKey = (id: string, platform: Platform) => `results/${id}/${platform}`;
const scheduleKey = (id: string) => `schedule/${id}`;
const thumbKey = (id: string) => `thumbs/${id}`;

// Max scheduling horizon and minimum lead time.
export const SCHEDULE_MAX_DAYS = 60;
export const SCHEDULE_MIN_LEAD_MS = 2 * 60 * 1000;

// A background function can run for at most 15 minutes.
const STALE_AFTER_MS = 16 * 60 * 1000;
const PENDING_STALE_AFTER_MS = 3 * 60 * 1000;

export function isValidPostId(id: string): boolean {
  return /^[a-z0-9]+-[A-Za-z0-9_-]+$/.test(id) && id.length <= 64;
}

export function newPostId(): string {
  return `${Date.now().toString(36)}-${randomId(6)}`;
}

export async function savePost(post: Post): Promise<void> {
  await dataStore().setJSON(postKey(post.id), post);
}

export async function getPost(id: string): Promise<Post | null> {
  if (!isValidPostId(id)) return null;
  return (await dataStore().get(postKey(id), { type: "json" })) as Post | null;
}

export async function getResult(id: string, platform: Platform): Promise<PlatformResult | null> {
  return (await dataStore().get(resultKey(id, platform), { type: "json" })) as PlatformResult | null;
}

export async function setResult(id: string, platform: Platform, result: PlatformResult): Promise<void> {
  await dataStore().setJSON(resultKey(id, platform), { ...result, updatedAt: new Date().toISOString() });
}

/** Every file of a post, also for older single-file posts. */
export function postItems(post: Post): MediaItem[] {
  if (post.items?.length) return post.items;
  return [
    {
      uploadId: post.uploadId,
      kind: post.mediaKind === "video" ? "video" : "image",
      fileName: post.fileName,
      mimeType: post.mimeType,
      size: post.size,
      width: post.width,
      height: post.height,
      duration: post.duration,
    },
  ];
}

export function newScheduledResult(): PlatformResult {
  return { status: "scheduled", attemptId: randomId(9), attempts: 0, step: "مجدول", updatedAt: new Date().toISOString() };
}

export function newPendingResult(previous?: PlatformResult | null): PlatformResult {
  return {
    status: "pending",
    attemptId: randomId(9),
    attempts: (previous?.attempts ?? 0) + 1,
    step: "بانتظار البدء",
    updatedAt: new Date().toISOString(),
  };
}

export function isFinal(result?: PlatformResult | null): boolean {
  return !!result && (result.status === "success" || result.status === "failed");
}

async function expireStale(id: string, platform: Platform, result: PlatformResult): Promise<PlatformResult> {
  const now = Date.now();
  const startedAt = result.startedAt ? Date.parse(result.startedAt) : NaN;
  const updatedAt = Date.parse(result.updatedAt);
  const stale =
    (result.status === "processing" && !Number.isNaN(startedAt) && now - startedAt > STALE_AFTER_MS) ||
    (result.status === "pending" && now - updatedAt > PENDING_STALE_AFTER_MS);
  if (!stale) return result;
  const failed: PlatformResult = {
    ...result,
    status: "failed",
    error:
      result.status === "pending"
        ? "عملية النشر ما بدأت. جرّب إعادة المحاولة."
        : "انتهت مهلة عملية النشر (١٥ دقيقة) قبل ما تكتمل. تأكد من حسابك على المنصة قبل إعادة المحاولة عشان ما يتكرر النشر.",
    finishedAt: new Date().toISOString(),
  };
  await setResult(id, platform, failed);
  return failed;
}

export async function getPostWithResults(id: string): Promise<PostWithResults | null> {
  const post = await getPost(id);
  if (!post) return null;
  const results: PostWithResults["results"] = {};
  await Promise.all(
    post.platforms.map(async (p) => {
      const r = await getResult(id, p);
      if (r) results[p] = await expireStale(id, p, r);
    }),
  );
  return { post, results };
}

// Delete the uploaded file once every selected platform succeeded.
export async function cleanupIfDone(data: PostWithResults): Promise<PostWithResults> {
  const { post, results } = data;
  if (post.mediaDeleted) return data;
  const allSucceeded = post.platforms.every((p) => results[p]?.status === "success");
  if (!allSucceeded) return data;
  for (const item of postItems(post)) await deleteUpload(item.uploadId);
  const updated = { ...post, mediaDeleted: true };
  await savePost(updated);
  return { post: updated, results };
}

export async function listPosts(limit = 100): Promise<PostWithResults[]> {
  const { blobs } = await dataStore().list({ prefix: "posts/" });
  const ids = blobs
    .map((b) => b.key.slice("posts/".length))
    .sort((a, b) => parseInt(b.split("-")[0], 36) - parseInt(a.split("-")[0], 36))
    .slice(0, limit);
  const items = await Promise.all(ids.map((id) => getPostWithResults(id)));
  return items.filter((x): x is PostWithResults => x !== null);
}

/* ------------------------------ Scheduling ------------------------------ */

export async function addToSchedule(id: string, scheduledAt: string): Promise<void> {
  await dataStore().setJSON(scheduleKey(id), { scheduledAt });
}

export async function removeFromSchedule(id: string): Promise<void> {
  await dataStore().delete(scheduleKey(id));
}

export async function listSchedule(): Promise<{ postId: string; scheduledAt: string }[]> {
  const store = dataStore();
  const { blobs } = await store.list({ prefix: "schedule/" });
  const entries = await Promise.all(
    blobs.map(async (b) => {
      const value = (await store.get(b.key, { type: "json" })) as { scheduledAt: string } | null;
      return value ? { postId: b.key.slice("schedule/".length), scheduledAt: value.scheduledAt } : null;
    }),
  );
  return entries.filter((e): e is { postId: string; scheduledAt: string } => e !== null);
}

/* ------------------------------ Thumbnails ------------------------------ */

export async function saveThumb(id: string, jpeg: ArrayBuffer): Promise<void> {
  await dataStore().set(thumbKey(id), jpeg);
}

export async function getThumb(id: string): Promise<ArrayBuffer | null> {
  if (!isValidPostId(id)) return null;
  return (await dataStore().get(thumbKey(id), { type: "arrayBuffer" })) as ArrayBuffer | null;
}

/** Removes a post completely (used when a scheduled post is cancelled). */
export async function deletePost(post: Post): Promise<void> {
  const store = dataStore();
  await removeFromSchedule(post.id);
  for (const item of postItems(post)) await deleteUpload(item.uploadId);
  await Promise.all([
    ...post.platforms.map((p) => store.delete(resultKey(post.id, p))),
    store.delete(thumbKey(post.id)),
  ]);
  await store.delete(postKey(post.id));
}
