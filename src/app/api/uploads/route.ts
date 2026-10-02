import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/session";
import { createUpload } from "@/lib/uploads";
import { randomId } from "@/lib/crypto";
import { MAX_FILE_SIZE } from "@/lib/limits";

// Starts a chunked upload. The browser then PUTs each chunk separately,
// so no single request comes close to the Netlify Functions body limit.
export async function POST(req: Request) {
  const denied = await requireApiUser();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { fileName?: string; mimeType?: string; size?: number } | null;
  const fileName = String(body?.fileName ?? "file").slice(0, 200);
  const mimeType = String(body?.mimeType ?? "");
  const size = Number(body?.size);

  if (!/^(video\/[\w.+-]+|image\/jpeg)$/.test(mimeType)) {
    return jsonError("نوع الملف غير مدعوم. ارفع فيديو أو صورة JPEG.");
  }
  if (!Number.isInteger(size) || size <= 0) return jsonError("حجم الملف غير صحيح.");
  if (size > MAX_FILE_SIZE) return jsonError("الملف أكبر من الحد المسموح (1 جيجا).");

  const meta = await createUpload({ id: randomId(16), fileName, mimeType, size });
  return NextResponse.json({ uploadId: meta.id, chunkSize: meta.chunkSize, chunks: meta.chunks });
}
