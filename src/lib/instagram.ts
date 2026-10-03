// Instagram Graph API — Content Publishing (via Facebook Login / Page linked account).
//
// Images: Instagram downloads the JPEG from a temporary signed URL served by
//         /api/media/<token>/<file> (valid for 1 hour).
// Videos: published as Reels with a *resumable upload*: the background function
//         streams the bytes from Netlify Blobs straight to rupload.facebook.com.
//         (A Netlify Function cannot serve a response larger than 20 MB, so a public
//         URL would fail for most videos.)
import { request } from "node:https";
import { appUrl, graphVersion } from "./env";
import { signMediaToken } from "./crypto";
import { PublishError, instagramError } from "./errors";
import { getInstagramCredentials, graphGet, graphPost } from "./tokens";
import { iterateFile } from "./uploads";
import type { Post, UploadMeta } from "./types";

type Progress = (step: string, progress?: number) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForContainer(containerId: string, token: string, progress: Progress, maxMs: number) {
  const startedAt = Date.now();
  for (;;) {
    const { status_code, status } = await graphGet<{ status_code?: string; status?: string }>(containerId, {
      fields: "status_code,status",
      access_token: token,
    });
    if (status_code === "FINISHED" || status_code === "PUBLISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new PublishError("انستقرام ما قدر يعالج الملف. تأكد من الصيغة (MP4 / H.264) والأبعاد والمدة.", `status=${status_code} ${status ?? ""}`);
    }
    if (Date.now() - startedAt > maxMs) {
      throw new PublishError("انستقرام طوّل في معالجة الفيديو. جرّب إعادة المحاولة بعد شوي.", `status=${status_code} ${status ?? ""}`);
    }
    await progress("انستقرام يعالج الملف");
    await sleep(6000);
  }
}

function streamToRupload(url: string, token: string, upload: UploadMeta, progress: Progress): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          offset: "0",
          file_size: String(upload.size),
          "Content-Length": String(upload.size),
          "Content-Type": "application/octet-stream",
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          let body: { success?: boolean; debug_info?: { message?: string } } = {};
          try {
            body = JSON.parse(raw);
          } catch {}
          if (res.statusCode && res.statusCode < 300 && body.success !== false) resolve();
          else reject(instagramError(res.statusCode ?? 0, body.debug_info ? { error: { message: body.debug_info.message ?? raw } } : body));
        });
      },
    );
    req.on("error", reject);

    (async () => {
      let sent = 0;
      let lastReport = 0;
      for await (const chunk of iterateFile(upload)) {
        sent += chunk.length;
        if (!req.write(chunk)) await new Promise((r) => req.once("drain", r));
        if (Date.now() - lastReport > 2000) {
          lastReport = Date.now();
          await progress("رفع الفيديو لانستقرام", Math.round((sent / upload.size) * 100));
        }
      }
      req.end();
    })().catch((err) => {
      req.destroy(err);
      reject(err);
    });
  });
}

export async function publishToInstagram(post: Post, uploads: UploadMeta[], progress: Progress): Promise<{ id: string; url: string }> {
  const upload = uploads[0];
  const caption = post.instagram?.caption ?? "";
  const { igUserId, token } = await getInstagramCredentials();

  let containerId: string;
  if (post.mediaKind === "carousel") {
    // Several images in one post: one child container per image, then a CAROUSEL container.
    const children: string[] = [];
    for (const [i, item] of uploads.entries()) {
      await progress(`تجهيز الصورة ${i + 1} من ${uploads.length}`, Math.round((i / uploads.length) * 80));
      const child = await graphPost<{ id: string }>(`${igUserId}/media`, {
        image_url: `${appUrl()}/api/media/${signMediaToken(item.id)}/image.jpg`,
        is_carousel_item: "true",
        access_token: token,
      });
      await waitForContainer(child.id, token, progress, 3 * 60 * 1000);
      children.push(child.id);
    }
    await progress("إنشاء البوست في انستقرام", 90);
    const container = await graphPost<{ id: string }>(`${igUserId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: token,
    });
    containerId = container.id;
    await waitForContainer(containerId, token, progress, 3 * 60 * 1000);
  } else if (post.mediaKind === "image") {
    await progress("إنشاء البوست في انستقرام", 10);
    const imageUrl = `${appUrl()}/api/media/${signMediaToken(upload.id)}/image.jpg`;
    const container = await graphPost<{ id: string }>(`${igUserId}/media`, {
      image_url: imageUrl,
      caption,
      access_token: token,
    });
    containerId = container.id;
    await waitForContainer(containerId, token, progress, 3 * 60 * 1000);
  } else {
    await progress("إنشاء الريل في انستقرام", 0);
    const container = await graphPost<{ id: string; uri?: string }>(`${igUserId}/media`, {
      media_type: "REELS",
      upload_type: "resumable",
      caption,
      share_to_feed: "true",
      access_token: token,
    });
    containerId = container.id;
    const uploadUrl = container.uri ?? `https://rupload.facebook.com/ig-api-upload/${graphVersion()}/${containerId}`;
    await streamToRupload(uploadUrl, token, upload, progress);
    await progress("انستقرام يعالج الفيديو", 100);
    await waitForContainer(containerId, token, progress, 10 * 60 * 1000);
  }

  await progress("نشر البوست في انستقرام", 100);
  let published: { id: string } | null = null;
  for (let attempt = 1; !published; attempt++) {
    try {
      published = await graphPost<{ id: string }>(`${igUserId}/media_publish`, {
        creation_id: containerId,
        access_token: token,
      });
    } catch (err) {
      // 9007 = media not ready yet; give it a few more seconds.
      if (attempt < 5 && err instanceof PublishError && /9007|2207027/.test(err.details ?? "")) {
        await sleep(8000);
        continue;
      }
      throw err;
    }
  }

  let url = `https://www.instagram.com/`;
  try {
    const media = await graphGet<{ permalink?: string }>(published.id, { fields: "permalink", access_token: token });
    if (media.permalink) url = media.permalink;
  } catch {
    // The post is live; a missing permalink is not a failure.
  }
  return { id: published.id, url };
}
