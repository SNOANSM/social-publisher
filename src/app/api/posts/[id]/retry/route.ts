import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { getPostWithResults, newPendingResult, setResult } from "@/lib/posts";
import { getUpload } from "@/lib/uploads";
import { triggerPublish } from "@/lib/trigger";

// Retries a single failed platform without touching the one that succeeded.
export async function POST(req: Request, ctx: RouteContext<"/api/posts/[id]/retry">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id } = await ctx.params;
  const { platform } = ((await req.json().catch(() => ({}))) ?? {}) as { platform?: string };
  if (platform !== "instagram" && platform !== "youtube") return jsonError("المنصة غير صحيحة.");

  const data = await getPostWithResults(id);
  if (!data) return jsonError("المنشور غير موجود.", 404);
  if (!data.post.platforms.includes(platform)) return jsonError("هذا المنشور ما كان على هذه المنصة.");

  const previous = data.results[platform];
  if (previous?.status !== "failed") return jsonError("ما تقدر تعيد المحاولة إلا للمنصة اللي فشلت.", 409);

  const upload = await getUpload(data.post.uploadId);
  if (!upload?.complete || data.post.mediaDeleted) {
    return jsonError("الملف الأصلي انحذف (تنحذف الملفات بعد ٣ أيام). ارفعه من جديد من صفحة النشر.", 410);
  }

  const result = newPendingResult(previous);
  await setResult(id, platform, result);
  await triggerPublish(id, platform, result);
  return NextResponse.json({ ok: true });
}
