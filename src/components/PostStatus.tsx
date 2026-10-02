"use client";

import { useEffect, useState } from "react";
import { PlatformIcon, PLATFORM_NAMES } from "@/components/PlatformIcon";
import { apiJson } from "@/lib/client-media";
import type { Platform, PlatformResult, PostWithResults } from "@/lib/types";

const isFinal = (r?: PlatformResult) => r?.status === "success" || r?.status === "failed";

// Polls the post until every platform has finished, and lets me retry only the failed ones.
export function PostStatus({ postId, onNew }: { postId: string; onNew: () => void }) {
  const [data, setData] = useState<PostWithResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Platform | null>(null);
  const [tick, setTick] = useState(0);

  const done = !!data && data.post.platforms.every((p) => isFinal(data.results[p]));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await apiJson<PostWithResults>(`/api/posts/${postId}`, { cache: "no-store" });
        if (cancelled) return;
        setData(next);
        setError(null);
        if (!next.post.platforms.every((p) => isFinal(next.results[p]))) timer = setTimeout(load, 2500);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [postId, tick]);

  const retry = async (platform: Platform) => {
    setRetrying(platform);
    try {
      await apiJson(`/api/posts/${postId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      setTick((t) => t + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetrying(null);
    }
  };

  if (!data) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
        {error ?? "جاري تحميل حالة النشر…"}
      </div>
    );
  }

  const { post, results } = data;
  const succeeded = post.platforms.filter((p) => results[p]?.status === "success");
  const failed = post.platforms.filter((p) => results[p]?.status === "failed");

  let summary: { tone: "ok" | "danger" | "warn" | "info"; text: string };
  if (!done) summary = { tone: "info", text: "جاري النشر… تقدر تسكّر الصفحة، النشر يكمل في الخلفية وتلقى النتيجة في السجل." };
  else if (!failed.length) summary = { tone: "ok", text: "تم النشر بنجاح 🎉" };
  else if (!succeeded.length) summary = { tone: "danger", text: "فشل النشر. شوف السبب تحت وأعد المحاولة." };
  else
    summary = {
      tone: "warn",
      text: `نجح النشر على ${succeeded.map((p) => PLATFORM_NAMES[p]).join(" و")}، وفشل على ${failed.map((p) => PLATFORM_NAMES[p]).join(" و")}. تقدر تعيد المحاولة للمنصة اللي فشلت بس.`,
    };

  const toneClass = {
    ok: "bg-ok-soft text-ok",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    info: "bg-accent-soft text-accent",
  }[summary.tone];

  return (
    <div className="space-y-4">
      <p className={`rounded-xl px-4 py-3 text-sm font-medium ${toneClass}`}>{summary.text}</p>
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="space-y-3">
        {post.platforms.map((p) => (
          <PlatformCard key={p} platform={p} result={results[p]} onRetry={() => retry(p)} retrying={retrying === p} />
        ))}
      </div>

      {done && (
        <button onClick={onNew} className="w-full rounded-xl bg-ink px-4 py-3 font-medium text-white transition hover:bg-ink/85">
          منشور جديد
        </button>
      )}
    </div>
  );
}

function PlatformCard({
  platform,
  result,
  onRetry,
  retrying,
}: {
  platform: Platform;
  result?: PlatformResult;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status = result?.status ?? "pending";
  const badge = {
    pending: { text: "بالانتظار", cls: "bg-canvas text-muted" },
    processing: { text: "جاري النشر", cls: "bg-accent-soft text-accent" },
    success: { text: "تم ✅", cls: "bg-ok-soft text-ok" },
    failed: { text: "فشل ❌", cls: "bg-danger-soft text-danger" },
  }[status];

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <PlatformIcon platform={platform} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{PLATFORM_NAMES[platform]}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
          </div>
          {(status === "processing" || status === "pending") && (
            <p className="mt-0.5 text-sm text-muted">
              {result?.step ?? "بالانتظار"}
              {status === "processing" && result?.progress !== undefined && result.progress > 0 && result.progress < 100 && (
                <span className="ltr"> {result.progress}%</span>
              )}
            </p>
          )}
        </div>
      </div>

      {status === "processing" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
          {result?.progress ? (
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${result.progress}%` }} />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/60" />
          )}
        </div>
      )}

      {status === "success" && result?.url && (
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm hover:bg-line/60"
        >
          <span className="font-medium">فتح البوست</span>
          <span className="ltr truncate text-xs text-muted">{result.url}</span>
        </a>
      )}

      {status === "failed" && (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{result?.error ?? "فشل النشر."}</p>
          {result?.errorDetails && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">التفاصيل التقنية</summary>
              <p className="ltr mt-1 break-all rounded-lg bg-canvas p-2 text-start">{result.errorDetails}</p>
            </details>
          )}
          <button
            onClick={onRetry}
            disabled={retrying}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-50"
          >
            {retrying ? "جاري إعادة المحاولة…" : `إعادة المحاولة على ${PLATFORM_NAMES[platform]}`}
          </button>
        </div>
      )}
    </div>
  );
}
