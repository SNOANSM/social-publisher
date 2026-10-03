import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { getUpload } from "@/lib/uploads";
import {
  SCHEDULE_MAX_DAYS,
  SCHEDULE_MIN_LEAD_MS,
  addToSchedule,
  listPosts,
  newPendingResult,
  newPostId,
  newScheduledResult,
  savePost,
  saveThumb,
  setResult,
} from "@/lib/posts";
import { getConnectionStatus } from "@/lib/tokens";
import { triggerPublish } from "@/lib/trigger";
import {
  IG_CAPTION_MAX,
  IG_CAROUSEL_MAX,
  IG_MAX_HASHTAGS,
  IG_MAX_IMAGE_SIZE,
  IG_MAX_VIDEO_SIZE,
  YT_DESCRIPTION_MAX_BYTES,
  YT_TAGS_MAX_CHARS,
  YT_TITLE_MAX,
  byteCount,
  charCount,
  hashtagCount,
  isShortsEligible,
  tagsLength,
} from "@/lib/limits";
import type { MediaItem, Platform, Post, YouTubePrivacy } from "@/lib/types";

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;
  return NextResponse.json({ posts: await listPosts() });
}

interface CreateBody {
  uploadIds?: string[];
  uploadId?: string;
  platforms?: string[];
  captionMode?: string;
  scheduledAt?: string | null;
  thumbnail?: string | null;
  media?: { width?: number; height?: number; duration?: number }[] | { width?: number; height?: number; duration?: number };
  instagram?: { caption?: string };
  youtube?: { title?: string; description?: string; tags?: unknown; privacy?: string; shorts?: boolean };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return jsonError("الطلب غير صالح.");

  // Files (in order)
  const uploadIds = (Array.isArray(body.uploadIds) ? body.uploadIds : body.uploadId ? [body.uploadId] : []).map(String);
  if (!uploadIds.length) return jsonError("ما فيه ملفات.");
  if (uploadIds.length > IG_CAROUSEL_MAX) return jsonError(`الحد ${IG_CAROUSEL_MAX} صور في البوست الواحد.`);
  const uploads = await Promise.all(uploadIds.map((id) => getUpload(id)));
  if (uploads.some((u) => !u || !u.complete)) return jsonError("أحد الملفات غير موجود أو رفعه ما اكتمل.");

  const metas = Array.isArray(body.media) ? body.media : [body.media ?? {}];
  const items: MediaItem[] = uploads.map((u, i) => ({
    uploadId: u!.id,
    kind: u!.mimeType.startsWith("video/") ? "video" : "image",
    fileName: u!.fileName,
    mimeType: u!.mimeType,
    size: u!.size,
    width: num(metas[i]?.width),
    height: num(metas[i]?.height),
    duration: num(metas[i]?.duration),
  }));
  if (items.length > 1 && items.some((i) => i.kind !== "image")) return jsonError("البوست المتعدد يقبل صور فقط.");
  const mediaKind = items.length > 1 ? "carousel" : items[0].kind;

  const platforms = [...new Set(body.platforms ?? [])].filter((p): p is Platform => p === "instagram" || p === "youtube");
  if (!platforms.length) return jsonError("اختر منصة وحدة على الأقل.");

  // Scheduling
  let scheduledAt: string | undefined;
  if (body.scheduledAt) {
    const at = Date.parse(body.scheduledAt);
    if (Number.isNaN(at)) return jsonError("وقت الجدولة غير صحيح.");
    if (at < Date.now() + SCHEDULE_MIN_LEAD_MS) return jsonError("وقت الجدولة لازم يكون بعد دقيقتين على الأقل من الحين.");
    if (at > Date.now() + SCHEDULE_MAX_DAYS * 86_400_000) return jsonError(`تقدر تجدول لين ${SCHEDULE_MAX_DAYS} يوم قدام بس.`);
    scheduledAt = new Date(at).toISOString();
  }

  // Thumbnail (small JPEG made in the browser, for the history/calendar)
  let thumb: Buffer | null = null;
  if (typeof body.thumbnail === "string" && body.thumbnail) {
    thumb = Buffer.from(body.thumbnail, "base64");
    if (thumb.length > 200_000 || thumb[0] !== 0xff || thumb[1] !== 0xd8) thumb = null;
  }

  const status = await getConnectionStatus();
  const first = items[0];
  const post: Post = {
    id: newPostId(),
    createdAt: new Date().toISOString(),
    scheduledAt,
    items,
    hasThumb: !!thumb,
    uploadId: first.uploadId,
    mediaKind,
    fileName: first.fileName,
    mimeType: first.mimeType,
    size: first.size,
    width: first.width,
    height: first.height,
    duration: first.duration,
    platforms,
    captionMode: body.captionMode === "separate" ? "separate" : "unified",
  };

  if (platforms.includes("instagram")) {
    if (!status.instagram.connected) return jsonError("حساب انستقرام غير مربوط.");
    const caption = String(body.instagram?.caption ?? "").trim();
    if (charCount(caption) > IG_CAPTION_MAX) return jsonError(`كابشن انستقرام أطول من ${IG_CAPTION_MAX} حرف.`);
    if (hashtagCount(caption) > IG_MAX_HASHTAGS) return jsonError(`انستقرام يسمح بـ ${IG_MAX_HASHTAGS} هاشتاق كحد أقصى.`);
    if (items.some((i) => i.kind === "video" && i.size > IG_MAX_VIDEO_SIZE)) return jsonError("فيديو انستقرام لازم يكون أقل من 300 ميقا.");
    if (items.some((i) => i.kind === "image" && i.size > IG_MAX_IMAGE_SIZE)) return jsonError("كل صورة لانستقرام لازم تكون أقل من 8 ميقا.");
    post.instagram = { caption };
  }

  if (platforms.includes("youtube")) {
    if (!status.youtube.connected) return jsonError("حساب يوتيوب غير مربوط.");
    if (mediaKind !== "video") return jsonError("يوتيوب يقبل فيديو واحد فقط.");
    const yt = body.youtube ?? {};
    const title = String(yt.title ?? "").replace(/[<>]/g, "").trim();
    const description = String(yt.description ?? "").replace(/[<>]/g, "").trim();
    const tags = (Array.isArray(yt.tags) ? yt.tags : []).map((t) => String(t).replace(/[<>]/g, "").trim()).filter(Boolean);
    const privacy = (["public", "unlisted", "private"].includes(String(yt.privacy)) ? yt.privacy : "private") as YouTubePrivacy;
    if (!title) return jsonError("عنوان يوتيوب مطلوب.");
    if (charCount(title) > YT_TITLE_MAX) return jsonError(`عنوان يوتيوب أطول من ${YT_TITLE_MAX} حرف.`);
    if (byteCount(description) > YT_DESCRIPTION_MAX_BYTES) return jsonError("وصف يوتيوب أطول من المسموح.");
    if (tagsLength(tags) > YT_TAGS_MAX_CHARS) return jsonError(`مجموع التاقات أطول من ${YT_TAGS_MAX_CHARS} حرف.`);
    post.youtube = {
      title,
      description,
      tags,
      privacy,
      shorts: Boolean(yt.shorts) && isShortsEligible(first.width, first.height, first.duration),
    };
  }

  await savePost(post);
  if (thumb) await saveThumb(post.id, new Uint8Array(thumb).buffer as ArrayBuffer);

  if (scheduledAt) {
    await Promise.all(platforms.map((p) => setResult(post.id, p, newScheduledResult())));
    await addToSchedule(post.id, scheduledAt);
  } else {
    const results = platforms.map((platform) => ({ platform, result: newPendingResult() }));
    await Promise.all(results.map(({ platform, result }) => setResult(post.id, platform, result)));
    await Promise.all(results.map(({ platform, result }) => triggerPublish(post.id, platform, result)));
  }

  return NextResponse.json({ id: post.id });
}
