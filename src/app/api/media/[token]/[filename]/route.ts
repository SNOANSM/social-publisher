import { verifyMediaToken } from "@/lib/crypto";
import { fileStream, getUpload } from "@/lib/uploads";

// Public on purpose: Instagram's servers download the image from here.
// Access needs a signed token that expires after one hour; there is no session.
// (Videos go to Instagram through resumable upload instead — see lib/instagram.ts.)
async function handle(req: Request, ctx: RouteContext<"/api/media/[token]/[filename]">) {
  const { token } = await ctx.params;
  const uploadId = verifyMediaToken(token);
  const meta = uploadId ? await getUpload(uploadId) : null;
  if (!meta || !meta.complete) return new Response("Not found", { status: 404 });

  const headers = {
    "Content-Type": meta.mimeType,
    "Content-Length": String(meta.size),
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  };
  if (req.method === "HEAD") return new Response(null, { headers });
  return new Response(fileStream(meta), { headers });
}

export { handle as GET, handle as HEAD };
