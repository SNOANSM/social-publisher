"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { YouTubeStats } from "@/lib/stats";

const compact = new Intl.NumberFormat("ar", { notation: "compact", maximumFractionDigits: 1, numberingSystem: "latn" });
const full = new Intl.NumberFormat("ar", { numberingSystem: "latn" });
const dateFmt = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", calendar: "gregory", numberingSystem: "latn" });
const nextFmt = new Intl.DateTimeFormat("ar", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  calendar: "gregory",
  numberingSystem: "latn",
});
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WINDOWS = [
  { from: 6, label: "الصبح (6–9)" },
  { from: 9, label: "الضحى (9–12)" },
  { from: 12, label: "الظهر (12–3)" },
  { from: 15, label: "العصر (3–6)" },
  { from: 18, label: "المغرب (6–9 م)" },
  { from: 21, label: "الليل (9–12 م)" },
  { from: 0, label: "بعد نص الليل (12–3)" },
  { from: 3, label: "الفجر (3–6)" },
];
const windowOf = (hour: number) => WINDOWS.find((w) => hour >= w.from && hour < w.from + 3)!;

function ago(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((now - Date.parse(iso)) / 3_600_000);
    return hours <= 0 ? "قبل شوي" : `قبل ${hours} ساعة`;
  }
  if (days === 1) return "أمس";
  return `قبل ${days} يوم`;
}

interface Slot {
  label: string;
  score: number;
  count: number;
}

// Best day / time window from my own videos: each video's views are divided by the
// median, so one viral video doesn't decide everything. Videos younger than 2 days are skipped.
function bestTimes(videos: YouTubeStats["videos"], now: number): { days: Slot[]; windows: Slot[]; basedOn: number } | null {
  const mature = videos.filter((v) => now - Date.parse(v.publishedAt) > 2 * 86_400_000);
  if (mature.length < 6) return null;
  const sorted = [...mature].map((v) => v.views).sort((a, b) => a - b);
  const median = Math.max(1, sorted[Math.floor(sorted.length / 2)]);
  const byDay = new Map<string, number[]>();
  const byWindow = new Map<string, number[]>();
  for (const v of mature) {
    const d = new Date(v.publishedAt);
    const score = Math.min(v.views / median, 5);
    const day = WEEKDAYS[d.getDay()];
    const win = windowOf(d.getHours()).label;
    byDay.set(day, [...(byDay.get(day) ?? []), score]);
    byWindow.set(win, [...(byWindow.get(win) ?? []), score]);
  }
  const rank = (map: Map<string, number[]>) =>
    [...map.entries()]
      .filter(([, scores]) => scores.length >= 2)
      .map(([label, scores]) => ({ label, score: scores.reduce((a, b) => a + b, 0) / scores.length, count: scores.length }))
      .sort((a, b) => b.score - a.score);
  return { days: rank(byDay).slice(0, 2), windows: rank(byWindow).slice(0, 2), basedOn: mature.length };
}

const subscribeNoop = () => () => undefined;

export function StatsView(props: {
  youtube: YouTubeStats | null;
  instagramConnected: boolean;
  appPublished: string[];
  appScheduled: string[];
}) {
  // Times depend on the phone's time zone: render in the browser only.
  const now = useSyncExternalStore(subscribeNoop, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
  if (!now) return <div className="h-64 animate-pulse rounded-2xl bg-card" />;

  const { youtube } = props;
  const lastApp = [...props.appPublished].sort().at(-1);
  const lastYt = youtube?.videos[0]?.publishedAt;
  const last = [lastApp, lastYt].filter(Boolean).sort().at(-1);
  const last30 = props.appPublished.filter((d) => now - Date.parse(d) < 30 * 86_400_000).length;
  const best = youtube ? bestTimes(youtube.videos, now) : null;
  const recent = youtube?.videos.slice(0, 12) ?? [];
  const maxViews = Math.max(1, ...recent.map((v) => v.views));

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="آخر منشور" value={last ? ago(last, now) : "—"} hint={last ? dateFmt.format(new Date(last)) : "ما نشرت للحين"} />
        <Tile label="المشتركين" value={youtube ? compact.format(youtube.subscribers) : "—"} hint="يوتيوب" />
        <Tile label="المشاهدات الكلية" value={youtube ? compact.format(youtube.totalViews) : "—"} hint="يوتيوب" />
        <Tile label="منشوراتك آخر 30 يوم" value={full.format(last30)} hint="من ناشر" />
      </div>

      {/* Best time */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">⏰ أفضل وقت للنشر</h2>
        {best && (best.days.length || best.windows.length) ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <BestList title="أفضل يوم" slots={best.days} />
              <BestList title="أفضل وقت باليوم" slots={best.windows} />
            </div>
            <p className="text-xs text-muted">
              محسوب من آخر {best.basedOn} فيديو في قناتك: الفيديوهات اللي نزلت في هالأوقات جابت مشاهدات أكثر من المعتاد. كل ما نشرت أكثر، يصير أدق.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">اقتراح عام:</span> من 8 لين 11 بالليل، وخصوصاً الخميس والجمعة.
            </p>
            <p className="text-xs text-muted">
              ما عندك فيديوهات كافية للحين عشان نحسب وقتك الخاص (نحتاج 6 فيديوهات على الأقل عمرها أكثر من يومين).
            </p>
          </>
        )}
        {props.appScheduled.length > 0 && (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
            عندك {props.appScheduled.length} منشور مجدول. أقربهم: {nextFmt.format(new Date(props.appScheduled[0]))}
          </p>
        )}
      </section>

      {/* Recent videos */}
      {youtube && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">مشاهدات آخر الفيديوهات</h2>
            <span className="text-xs text-muted">{youtube.channelTitle}</span>
          </div>
          {recent.length === 0 && <p className="text-sm text-muted">ما فيه فيديوهات في القناة للحين.</p>}
          <ul className="space-y-3">
            {recent.map((v) => (
              <li key={v.id}>
                <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl p-1 hover:bg-canvas">
                  {v.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-20 shrink-0 rounded-lg bg-canvas" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p dir="auto" className="truncate text-sm font-medium">
                      {v.title}
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas" title={`${full.format(v.views)} مشاهدة`}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v.views / maxViews) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted">
                      <span className="font-semibold text-ink">{full.format(v.views)}</span> مشاهدة · {full.format(v.likes)} لايك ·{" "}
                      {full.format(v.comments)} تعليق · {dateFmt.format(new Date(v.publishedAt))}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!props.instagramConnected && (
        <div className="rounded-2xl border border-dashed border-line bg-card p-4 text-sm">
          <p className="font-medium">إحصائيات انستقرام</p>
          <p className="mt-1 text-muted">تظهر هنا بعد ما نربط حساب انستقرام.</p>
          <Link href="/settings" className="mt-2 inline-block font-medium text-accent">
            الإعدادات ←
          </Link>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

function BestList({ title, slots }: { title: string; slots: Slot[] }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-xs text-muted">{title}</p>
      {slots.length === 0 ? (
        <p className="mt-1 text-sm text-muted">بيانات قليلة</p>
      ) : (
        <ol className="mt-1 space-y-1">
          {slots.map((s, i) => (
            <li key={s.label} className="flex items-baseline justify-between gap-2 text-sm">
              <span className={i === 0 ? "font-semibold" : ""}>
                {i === 0 ? "🥇 " : "🥈 "}
                {s.label}
              </span>
              <span className="text-xs text-muted">×{s.score.toFixed(1)} من المعتاد</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
