import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { getPostWithResults, newPendingResult, removeFromSchedule, savePost, setResult } from "@/lib/posts";
import { triggerPublish } from "@/lib/trigger";

// Publishes a scheduled post right away instead of waiting for its time.
export async function POST(_req: Request, ctx: RouteContext<"/api/posts/[id]/publish-now">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id } = await ctx.params;
  const data = await getPostWithResults(id);
  if (!data) return jsonError("المنشور غير موجود.", 404);
  const scheduled = data.post.platforms.filter((p) => data.results[p]?.status === "scheduled");
  if (!scheduled.length) return jsonError("المنشور مو مجدول.", 409);

  await removeFromSchedule(id);
  await savePost({ ...data.post, scheduledAt: new Date().toISOString() });
  for (const platform of scheduled) {
    const result = newPendingResult(data.results[platform]);
    await setResult(id, platform, result);
    await triggerPublish(id, platform, result);
  }
  return NextResponse.json({ ok: true });
}
