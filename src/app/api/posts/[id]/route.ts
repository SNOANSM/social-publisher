import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { cleanupIfDone, getPostWithResults } from "@/lib/posts";

export async function GET(_req: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id } = await ctx.params;
  const data = await getPostWithResults(id);
  if (!data) return jsonError("المنشور غير موجود.", 404);
  return NextResponse.json(await cleanupIfDone(data), { headers: { "Cache-Control": "no-store" } });
}
