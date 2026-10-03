import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { getYouTubeStats, type YouTubeStats } from "@/lib/stats";
import { getConnectionStatus } from "@/lib/tokens";
import { listPosts } from "@/lib/posts";
import { PublishError } from "@/lib/errors";
import { StatsView } from "@/components/StatsView";

export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  await requirePageUser();
  const { refresh } = await searchParams;
  const [status, posts] = await Promise.all([getConnectionStatus(), listPosts(300)]);

  let youtube: YouTubeStats | null = null;
  let youtubeError: string | null = null;
  if (status.youtube.connected) {
    try {
      youtube = await getYouTubeStats(refresh === "1");
    } catch (err) {
      youtubeError = err instanceof PublishError ? err.userMessage : "تعذّر جلب إحصائيات يوتيوب.";
    }
  }

  // Activity inside the app (any platform)
  const published = posts
    .filter(({ post, results }) => post.platforms.some((p) => results[p]?.status === "success"))
    .map(({ post }) => post.scheduledAt ?? post.createdAt);
  const scheduled = posts
    .filter(({ post, results }) => post.platforms.some((p) => results[p]?.status === "scheduled"))
    .map(({ post }) => post.scheduledAt!)
    .sort();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإحصائيات</h1>
          <p className="mt-1 text-sm text-muted">أرقام قناتك، وأفضل وقت تنشر فيه.</p>
        </div>
        {youtube && (
          <Link href="/stats?refresh=1" className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm hover:bg-card">
            تحديث ↻
          </Link>
        )}
      </div>

      {!status.youtube.connected && (
        <div className="rounded-2xl border border-dashed border-line bg-card p-5 text-sm">
          <p className="font-medium">اربط يوتيوب عشان تشوف إحصائياتك.</p>
          <Link href="/settings" className="mt-2 inline-block font-medium text-accent">
            الإعدادات ←
          </Link>
        </div>
      )}
      {youtubeError && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{youtubeError}</p>}

      <StatsView
        youtube={youtube}
        instagramConnected={status.instagram.connected}
        appPublished={published}
        appScheduled={scheduled}
      />
    </div>
  );
}
