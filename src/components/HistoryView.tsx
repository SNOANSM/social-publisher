"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { PlatformIcon, PLATFORM_NAMES } from "@/components/PlatformIcon";
import type { MediaKind, Platform, ResultStatus } from "@/lib/types";

export interface HistoryItem {
  id: string;
  when: string; // publish time: scheduledAt or createdAt (ISO)
  kind: MediaKind;
  count: number;
  text: string;
  hasThumb: boolean;
  by?: string; // who posted it, when it wasn't me
  platforms: { platform: Platform; status: ResultStatus; url?: string; error?: string }[];
}

const WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const STATUS: Record<ResultStatus, { text: string; cls: string }> = {
  scheduled: { text: "مجدول", cls: "bg-accent-soft text-accent" },
  pending: { text: "بالانتظار", cls: "bg-canvas text-muted" },
  processing: { text: "جاري النشر", cls: "bg-accent-soft text-accent" },
  success: { text: "تم", cls: "bg-ok-soft text-ok" },
  failed: { text: "فشل", cls: "bg-danger-soft text-danger" },
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar", { calendar: "gregory", numberingSystem: "latn", ...opts });
const monthTitle = fmt({ month: "long", year: "numeric" });
const dayTitle = fmt({ weekday: "long", day: "numeric", month: "long" });
const timeOf = fmt({ hour: "numeric", minute: "2-digit" });
const fullDate = fmt({ weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

const isScheduled = (item: HistoryItem) => item.platforms.some((p) => p.status === "scheduled");

function relativeDay(d: Date): string {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (dayKey(d) === dayKey(today)) return "اليوم";
  if (dayKey(d) === dayKey(yesterday)) return "أمس";
  if (dayKey(d) === dayKey(tomorrow)) return "بكرة";
  return dayTitle.format(d);
}

export function HistoryView({ items }: { items: HistoryItem[] }) {
  // Dates depend on the phone's time zone, so render only in the browser.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of items) {
      const key = dayKey(new Date(item.when));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  if (!mounted) return <div className="h-64 animate-pulse rounded-2xl bg-card" />;

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
        <p className="font-medium">ما نشرت شي للحين</p>
        <Link href="/" className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-medium text-on-ink">
          منشور جديد
        </Link>
      </div>
    );
  }

  const upcoming = items.filter(isScheduled).sort((a, b) => Date.parse(a.when) - Date.parse(b.when));

  // Calendar grid for the visible month (weeks start on Sunday).
  const firstDay = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.year, month.month, i + 1)),
  ];
  const todayKey = dayKey(new Date());
  const shiftMonth = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(null);
  };

  // List under the calendar: one selected day, or everything (newest first), grouped by day.
  const listed = (selected ? (byDay.get(selected) ?? []) : items.filter((i) => !isScheduled(i))).sort(
    (a, b) => Date.parse(b.when) - Date.parse(a.when),
  );
  const groups: { key: string; date: Date; items: HistoryItem[] }[] = [];
  for (const item of listed) {
    const date = new Date(item.when);
    const key = dayKey(date);
    const group = groups.find((g) => g.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, date, items: [item] });
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && !selected && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">⏰ المجدولة ({upcoming.length})</h2>
          {upcoming.map((item) => (
            <PostCard key={item.id} item={item} timeLabel={fullDate.format(new Date(item.when))} />
          ))}
        </section>
      )}

      {/* Calendar */}
      <section className="rounded-2xl border border-line bg-card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => shiftMonth(-1)} aria-label="الشهر السابق" className="rounded-lg px-3 py-1.5 text-lg hover:bg-canvas">
            →
          </button>
          <span className="font-semibold">{monthTitle.format(firstDay)}</span>
          <button onClick={() => shiftMonth(1)} aria-label="الشهر التالي" className="rounded-lg px-3 py-1.5 text-lg hover:bg-canvas">
            ←
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />;
            const key = dayKey(date);
            const dayItems = byDay.get(key) ?? [];
            const withThumb = dayItems.find((it) => it.hasThumb);
            const anyScheduled = dayItems.some(isScheduled);
            const isSelected = selected === key;
            return (
              <button
                key={key}
                onClick={() => setSelected(isSelected ? null : key)}
                disabled={!dayItems.length}
                className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg text-sm transition ${
                  isSelected ? "ring-2 ring-ink" : ""
                } ${dayItems.length ? "hover:opacity-90" : "cursor-default"} ${key === todayKey ? "font-bold" : ""}`}
              >
                {withThumb ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/posts/${withThumb.id}/thumb`} alt="" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute inset-0 bg-black/35" />
                    <span className="relative text-white drop-shadow">{date.getDate()}</span>
                  </>
                ) : (
                  <span className={dayItems.length ? "text-ink" : "text-muted/70"}>{date.getDate()}</span>
                )}
                {dayItems.length > 0 && (
                  <span
                    className={`absolute bottom-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white ${
                      anyScheduled ? "bg-accent" : "bg-black/75"
                    }`}
                  >
                    {dayItems.length}
                  </span>
                )}
                {key === todayKey && !withThumb && <span className="absolute top-1 size-1 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* List */}
      <section className="space-y-5">
        {selected && (
          <button onClick={() => setSelected(null)} className="text-sm font-medium text-accent">
            ← عرض الكل
          </button>
        )}
        {groups.length === 0 && <p className="text-center text-sm text-muted">ما فيه منشورات في هذا اليوم.</p>}
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted">{relativeDay(group.date)}</h3>
            {group.items.map((item) => (
              <PostCard
                key={item.id}
                item={item}
                timeLabel={isScheduled(item) ? `مجدول ${timeOf.format(new Date(item.when))}` : timeOf.format(new Date(item.when))}
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function PostCard({ item, timeLabel }: { item: HistoryItem; timeLabel: string }) {
  const failed = item.platforms.some((p) => p.status === "failed");
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-card p-3">
      {item.hasThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/posts/${item.id}/thumb`} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-canvas text-xs text-muted">
          {item.kind === "video" ? "فيديو" : "صورة"}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>
            {timeLabel} · {item.kind === "video" ? "فيديو" : item.kind === "carousel" ? `${item.count} صور` : "صورة"}
            {item.by && <> · بواسطة <span className="ltr">{item.by}</span></>}
          </span>
          <Link href={`/?post=${item.id}`} className="shrink-0 font-medium text-accent">
            {failed ? "إعادة المحاولة" : "التفاصيل"}
          </Link>
        </div>
        <p dir="auto" className="line-clamp-2 text-sm">
          {item.text || <span className="text-muted">بدون كابشن</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {item.platforms.map((p) => {
            const s = STATUS[p.status];
            const chip = (
              <>
                <PlatformIcon platform={p.platform} className="size-4 rounded" />
                <span>{PLATFORM_NAMES[p.platform]}</span>
                <span className={`rounded-full px-1.5 text-[10px] ${s.cls}`}>{s.text}</span>
              </>
            );
            return p.status === "success" && p.url ? (
              <a
                key={p.platform}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-canvas px-2 py-1 text-xs hover:bg-line/60"
              >
                {chip}
                <span className="text-accent">↗</span>
              </a>
            ) : (
              <span key={p.platform} title={p.error} className="flex items-center gap-1.5 rounded-lg bg-canvas px-2 py-1 text-xs">
                {chip}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
