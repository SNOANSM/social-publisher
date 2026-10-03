import type { Config } from "@netlify/functions";
import { getPost, getResult, listSchedule, newPendingResult, postItems, removeFromSchedule, setResult } from "../../src/lib/posts";
import { dispatchPublish } from "../../src/lib/dispatch";
import { touchUpload } from "../../src/lib/uploads";

// Runs every 5 minutes: publishes the scheduled posts whose time has come.
// Each platform is handed to the publish-background function, exactly like "publish now".
export default async function scheduler() {
  const due = (await listSchedule()).filter((s) => Date.parse(s.scheduledAt) <= Date.now());
  for (const { postId } of due) {
    // Remove first, so an overlapping run can never publish the same post twice.
    await removeFromSchedule(postId);
    const post = await getPost(postId);
    if (!post) continue;

    // Keep the files for 3 days from now (in case a platform fails and needs a retry).
    for (const item of postItems(post)) await touchUpload(item.uploadId).catch(() => undefined);

    for (const platform of post.platforms) {
      const current = await getResult(postId, platform);
      if (current?.status !== "scheduled") continue;
      const next = newPendingResult(current);
      await setResult(postId, platform, next);
      await dispatchPublish(postId, platform, next);
    }
    console.log(`[scheduler] started ${postId}`);
  }
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
