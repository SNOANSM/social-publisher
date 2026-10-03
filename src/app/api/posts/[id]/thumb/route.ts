import { requireApiUser } from "@/lib/session";
import { getThumb } from "@/lib/posts";

export async function GET(_req: Request, ctx: RouteContext<"/api/posts/[id]/thumb">) {
  const denied = await requireApiUser();
  if (denied) return denied;
  const { id } = await ctx.params;
  const jpeg = await getThumb(id);
  if (!jpeg) return new Response("Not found", { status: 404 });
  return new Response(jpeg, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable" },
  });
}
