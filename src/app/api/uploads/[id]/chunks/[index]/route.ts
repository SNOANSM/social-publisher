import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { expectedChunkSize, getUpload, putChunk } from "@/lib/uploads";

export async function PUT(req: Request, ctx: RouteContext<"/api/uploads/[id]/chunks/[index]">) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const { id, index: rawIndex } = await ctx.params;
  const meta = await getUpload(id);
  if (!meta) return jsonError("عملية الرفع غير موجودة.", 404);
  if (meta.complete) return jsonError("الرفع مكتمل مسبقاً.", 409);

  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= meta.chunks) return jsonError("رقم الجزء غير صحيح.");

  const data = await req.arrayBuffer();
  if (data.byteLength !== expectedChunkSize(meta, index)) {
    return jsonError("حجم الجزء غير مطابق. أعد المحاولة.");
  }
  await putChunk(meta, index, data);
  return NextResponse.json({ ok: true });
}
