import { requirePageUser } from "@/lib/session";
import { listPosts } from "@/lib/posts";
import { HistoryView, type HistoryItem } from "@/components/HistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requirePageUser();
  const posts = await listPosts(300);

  const items: HistoryItem[] = posts.map(({ post, results }) => ({
    id: post.id,
    when: post.scheduledAt ?? post.createdAt,
    kind: post.mediaKind,
    count: post.items?.length ?? 1,
    text: post.instagram?.caption || post.youtube?.title || post.youtube?.description || "",
    hasThumb: !!post.hasThumb,
    platforms: post.platforms.map((p) => ({
      platform: p,
      status: results[p]?.status ?? "pending",
      url: results[p]?.url,
      error: results[p]?.error,
    })),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">السجل</h1>
        <p className="mt-1 text-sm text-muted">كل اللي نشرته واللي مجدول، يوم بيوم.</p>
      </div>
      <HistoryView items={items} />
    </div>
  );
}
