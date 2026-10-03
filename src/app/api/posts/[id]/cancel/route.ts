import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { deletePost, getPostWithResults } from "@/lib/posts";

// Cancels a scheduled post: removes it and its files completely.
export async function POST(_req: Request, ctx: RouteContext<"/api/posts/[id]/cancel">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id } = await ctx.params;
  const data = await getPostWithResults(id);
  if (!data) return jsonError("المنشور غير موجود.", 404);
  const allScheduled = data.post.platforms.every((p) => data.results[p]?.status === "scheduled");
  if (!allScheduled) return jsonError("المنشور بدأ ينشر، ما تقدر تلغيه.", 409);

  await deletePost(data.post);
  return NextResponse.json({ ok: true });
}
