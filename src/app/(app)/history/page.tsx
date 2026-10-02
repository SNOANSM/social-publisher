import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { listPosts } from "@/lib/posts";
import { formatDate } from "@/lib/format";
import { PlatformIcon, PLATFORM_NAMES } from "@/components/PlatformIcon";
import type { PlatformResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS: Record<PlatformResult["status"], { text: string; cls: string }> = {
  pending: { text: "بالانتظار", cls: "bg-canvas text-muted" },
  processing: { text: "جاري النشر", cls: "bg-accent-soft text-accent" },
  success: { text: "تم", cls: "bg-ok-soft text-ok" },
  failed: { text: "فشل", cls: "bg-danger-soft text-danger" },
};

export default async function HistoryPage() {
  await requirePageUser();
  const posts = await listPosts();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">سجل المنشورات</h1>
        <p className="mt-1 text-sm text-muted">كل اللي نشرته من هنا، مع الحالة والروابط.</p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
          <p className="font-medium">ما نشرت شي للحين</p>
          <Link href="/" className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white">
            منشور جديد
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map(({ post, results }) => {
            const text = post.instagram?.caption || post.youtube?.title || post.youtube?.description || "";
            const hasFailed = post.platforms.some((p) => results[p]?.status === "failed");
            const inProgress = post.platforms.some((p) => ["pending", "processing"].includes(results[p]?.status ?? ""));
            return (
              <li key={post.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">
                      {formatDate(post.createdAt)} · {post.mediaKind === "video" ? "فيديو" : "صورة"}
                    </p>
                    <p dir="auto" className="mt-1 line-clamp-2 whitespace-pre-line text-sm">
                      {text || <span className="text-muted">بدون كابشن</span>}
                    </p>
                  </div>
                  {(hasFailed || inProgress) && (
                    <Link
                      href={`/?post=${post.id}`}
                      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-canvas"
                    >
                      {hasFailed ? "إعادة المحاولة" : "متابعة"}
                    </Link>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {post.platforms.map((p) => {
                    const r = results[p];
                    const s = STATUS[r?.status ?? "pending"];
                    const content = (
                      <>
                        <PlatformIcon platform={p} className="size-5 rounded-md" />
                        <span className="font-medium">{PLATFORM_NAMES[p]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.cls}`}>{s.text}</span>
                        {r?.status === "success" && r.url && <span className="text-xs text-accent">فتح ↗</span>}
                      </>
                    );
                    return r?.status === "success" && r.url ? (
                      <a
                        key={p}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl bg-canvas px-2.5 py-1.5 text-sm hover:bg-line/60"
                      >
                        {content}
                      </a>
                    ) : (
                      <span key={p} className="flex items-center gap-2 rounded-xl bg-canvas px-2.5 py-1.5 text-sm" title={r?.error}>
                        {content}
                      </span>
                    );
                  })}
                </div>
                {post.platforms.map((p) =>
                  results[p]?.status === "failed" ? (
                    <p key={p} className="mt-2 text-xs text-danger">
                      {PLATFORM_NAMES[p]}: {results[p]?.error}
                    </p>
                  ) : null,
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
