import type { Config } from "@netlify/functions";
import { forceRefreshYouTube, refreshInstagramIfNeeded } from "../../src/lib/tokens";
import { deleteUpload, getUpload, listUploadIds } from "../../src/lib/uploads";
import { getPost, listSchedule, postItems } from "../../src/lib/posts";

const MEDIA_TTL_MS = 72 * 60 * 60 * 1000;

// Runs every day:
//  1. Refreshes the YouTube access token (keeps the refresh token active).
//  2. Renews the Instagram long-lived token when it gets close to expiring.
//  3. Deletes uploaded files older than 72 hours (failed or abandoned posts),
//     except the files of posts that are still scheduled.
export default async function maintenance() {
  const results = await Promise.allSettled([
    forceRefreshYouTube(),
    refreshInstagramIfNeeded(),
    (async () => {
      const keep = new Set<string>();
      for (const { postId } of await listSchedule()) {
        const post = await getPost(postId);
        if (post) for (const item of postItems(post)) keep.add(item.uploadId);
      }
      const ids = await listUploadIds();
      let deleted = 0;
      for (const id of ids) {
        if (keep.has(id)) continue;
        const meta = await getUpload(id);
        const createdAt = meta ? Date.parse(meta.createdAt) : 0;
        if (!meta || Date.now() - createdAt > MEDIA_TTL_MS) {
          await deleteUpload(id);
          deleted++;
        }
      }
      return deleted;
    })(),
  ]);
  const [yt, ig, media] = results;
  console.log("[maintenance]", {
    youtube: yt.status === "fulfilled" ? "ok" : String(yt.reason),
    instagram: ig.status === "fulfilled" ? "ok" : String(ig.reason),
    media: media.status === "fulfilled" ? `deleted ${media.value}` : String(media.reason),
  });
}

export const config: Config = {
  schedule: "@daily",
};
