import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { getUpload } from "@/lib/uploads";
import { listPosts, newPendingResult, newPostId, savePost, setResult } from "@/lib/posts";
import { getConnectionStatus } from "@/lib/tokens";
import { triggerPublish } from "@/lib/trigger";
import {
  IG_CAPTION_MAX,
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
import type { Platform, Post, YouTubePrivacy } from "@/lib/types";

export async function GET() {
  const denied = await requireApiUser();
  if (denied) return denied;
  return NextResponse.json({ posts: await listPosts() });
}

interface CreateBody {
  uploadId?: string;
  platforms?: string[];
  captionMode?: string;
  media?: { width?: number; height?: number; duration?: number };
  instagram?: { caption?: string };
  youtube?: { title?: string; description?: string; tags?: unknown; privacy?: string; shorts?: boolean };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) return jsonError("الطلب غير صالح.");

  const upload = body.uploadId ? await getUpload(body.uploadId) : null;
  if (!upload || !upload.complete) return jsonError("الملف غير موجود أو رفعه ما اكتمل.");

  const platforms = [...new Set(body.platforms ?? [])].filter((p): p is Platform => p === "instagram" || p === "youtube");
  if (!platforms.length) return jsonError("اختر منصة وحدة على الأقل.");

  const mediaKind = upload.mimeType.startsWith("video/") ? "video" : "image";
  const width = num(body.media?.width);
  const height = num(body.media?.height);
  const duration = num(body.media?.duration);
  const status = await getConnectionStatus();

  const post: Post = {
    id: newPostId(),
    createdAt: new Date().toISOString(),
    uploadId: upload.id,
    mediaKind,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.size,
    width,
    height,
    duration,
    platforms,
    captionMode: body.captionMode === "separate" ? "separate" : "unified",
  };

  if (platforms.includes("instagram")) {
    if (!status.instagram.connected) return jsonError("حساب انستقرام غير مربوط.");
    const caption = String(body.instagram?.caption ?? "").trim();
    if (charCount(caption) > IG_CAPTION_MAX) return jsonError(`كابشن انستقرام أطول من ${IG_CAPTION_MAX} حرف.`);
    if (hashtagCount(caption) > IG_MAX_HASHTAGS) return jsonError(`انستقرام يسمح بـ ${IG_MAX_HASHTAGS} هاشتاق كحد أقصى.`);
    if (mediaKind === "video" && upload.size > IG_MAX_VIDEO_SIZE) return jsonError("فيديو انستقرام لازم يكون أقل من 300 ميقا.");
    if (mediaKind === "image" && upload.size > IG_MAX_IMAGE_SIZE) return jsonError("صورة انستقرام لازم تكون أقل من 8 ميقا.");
    post.instagram = { caption };
  }

  if (platforms.includes("youtube")) {
    if (!status.youtube.connected) return jsonError("حساب يوتيوب غير مربوط.");
    if (mediaKind !== "video") return jsonError("يوتيوب يقبل فيديو فقط.");
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
      shorts: Boolean(yt.shorts) && isShortsEligible(width, height, duration),
    };
  }

  await savePost(post);
  const results = platforms.map((p) => ({ platform: p, result: newPendingResult() }));
  await Promise.all(results.map(({ platform, result }) => setResult(post.id, platform, result)));
  await Promise.all(results.map(({ platform, result }) => triggerPublish(post.id, platform, result)));

  return NextResponse.json({ id: post.id });
}
