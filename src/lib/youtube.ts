// YouTube Data API v3 — videos.insert using the resumable upload protocol.
// The file is read from Netlify Blobs chunk by chunk, so it is never fully held in memory.
import { getYouTubeAccessToken } from "./tokens";
import { PublishError, youtubeError } from "./errors";
import { readChunk } from "./uploads";
import { YT_TITLE_MAX, byteCount, YT_DESCRIPTION_MAX_BYTES } from "./limits";
import type { Post, UploadMeta } from "./types";

type Progress = (step: string, progress?: number) => Promise<void>;

// Blob chunks are 3 MiB; send 4 of them per request (12 MiB, still a multiple of 256 KiB).
const CHUNKS_PER_REQUEST = 4;

function withShortsTag(title: string, description: string, shorts: boolean) {
  if (!shorts || /#shorts/i.test(title + description)) return { title, description };
  const tag = " #Shorts";
  if (Array.from(title).length + tag.length <= YT_TITLE_MAX) return { title: title + tag, description };
  const desc = description ? `${description}\n\n#Shorts` : "#Shorts";
  return { title, description: byteCount(desc) <= YT_DESCRIPTION_MAX_BYTES ? desc : description };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function publishToYouTube(post: Post, upload: UploadMeta, progress: Progress): Promise<{ id: string; url: string }> {
  if (!post.youtube) throw new PublishError("بيانات يوتيوب ناقصة.");
  if (post.mediaKind !== "video") throw new PublishError("يوتيوب يقبل فيديو فقط.");

  await progress("تجهيز الرفع ليوتيوب", 0);
  const token = await getYouTubeAccessToken();
  const { title, description } = withShortsTag(post.youtube.title, post.youtube.description, post.youtube.shorts);

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(upload.size),
        "X-Upload-Content-Type": upload.mimeType,
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          tags: post.youtube.tags.length ? post.youtube.tags : undefined,
          categoryId: "22",
        },
        status: {
          privacyStatus: post.youtube.privacy,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  if (!init.ok) throw youtubeError(init.status, await readJson(init));
  const sessionUrl = init.headers.get("location");
  if (!sessionUrl) throw new PublishError("يوتيوب ما رجّع رابط جلسة الرفع.");

  let video: { id?: string } | null = null;
  for (let first = 0; first < upload.chunks; first += CHUNKS_PER_REQUEST) {
    const last = Math.min(first + CHUNKS_PER_REQUEST, upload.chunks) - 1;
    const parts: Uint8Array[] = [];
    for (let i = first; i <= last; i++) parts.push(await readChunk(upload, i));
    const body = Buffer.concat(parts);
    const start = first * upload.chunkSize;
    const end = start + body.length - 1;

    let attempt = 0;
    for (;;) {
      attempt++;
      let res: Response;
      try {
        res = await fetch(sessionUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Length": String(body.length),
            "Content-Range": `bytes ${start}-${end}/${upload.size}`,
          },
          body,
        });
      } catch (err) {
        if (attempt < 4) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      if (res.status === 308) break; // chunk accepted, more to come
      if (res.ok) {
        video = (await readJson(res)) as { id?: string };
        break;
      }
      if (res.status >= 500 && attempt < 4) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw youtubeError(res.status, await readJson(res));
    }

    await progress("رفع الفيديو ليوتيوب", Math.round(((end + 1) / upload.size) * 100));
  }

  if (!video?.id) throw new PublishError("انتهى الرفع لكن يوتيوب ما رجّع معرّف الفيديو.");
  const url = post.youtube.shorts ? `https://youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`;
  return { id: video.id, url };
}
