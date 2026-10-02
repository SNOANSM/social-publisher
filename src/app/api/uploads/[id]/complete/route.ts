import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { getUpload, markComplete, missingChunks } from "@/lib/uploads";

export async function POST(_req: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id } = await ctx.params;
  const meta = await getUpload(id);
  if (!meta) return jsonError("عملية الرفع غير موجودة.", 404);
  if (meta.complete) return NextResponse.json({ ok: true });

  const missing = await missingChunks(meta);
  if (missing.length) return NextResponse.json({ error: "بعض أجزاء الملف ناقصة.", missing }, { status: 409 });

  await markComplete(meta);
  return NextResponse.json({ ok: true });
}
