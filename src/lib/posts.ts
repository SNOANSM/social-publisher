import { dataStore } from "./stores";
import { randomId } from "./crypto";
import { deleteUpload } from "./uploads";
import { type Platform, type PlatformResult, type Post, type PostWithResults } from "./types";

// Each platform writes its own result key, so two background functions
// running in parallel never overwrite each other's progress.
const postKey = (id: string) => `posts/${id}`;
const resultKey = (id: string, platform: Platform) => `results/${id}/${platform}`;

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
  await deleteUpload(post.uploadId);
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
