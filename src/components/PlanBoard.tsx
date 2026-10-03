"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { apiJson } from "@/lib/client-media";
import type { PlanFormat, PlanItem, PlanStatus } from "@/lib/plan";
import type { Platform } from "@/lib/types";

const FORMATS: { value: PlanFormat; label: string }[] = [
  { value: "reel", label: "ريل" },
  { value: "post", label: "بوست صورة" },
  { value: "carousel", label: "عدة صور" },
  { value: "video", label: "فيديو يوتيوب" },
  { value: "short", label: "شورتس" },
  { value: "story", label: "ستوري" },
];
const formatLabel = (f: PlanFormat) => FORMATS.find((x) => x.value === f)?.label ?? f;

const STATUS: Record<PlanStatus, { label: string; cls: string; next: PlanStatus }> = {
  idea: { label: "💡 فكرة", cls: "bg-canvas text-muted", next: "ready" },
  ready: { label: "✅ جاهز", cls: "bg-accent-soft text-accent", next: "done" },
  done: { label: "✔ منشور", cls: "bg-ok-soft text-ok", next: "idea" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const toDayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDayString = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dayFmt = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", calendar: "gregory", numberingSystem: "latn" });
const shortFmt = new Intl.DateTimeFormat("ar", { weekday: "short", day: "numeric", month: "short", calendar: "gregory", numberingSystem: "latn" });

const INPUT = "w-full rounded-xl border border-line bg-field px-3 py-2.5 text-sm outline-none focus:border-accent";

interface Draft {
  title: string;
  notes: string;
  date: string;
  time: string;
  platforms: Platform[];
  format: PlanFormat;
}
const emptyDraft = (date = ""): Draft => ({ title: "", notes: "", date, time: "", platforms: ["instagram"], format: "reel" });

const subscribeNoop = () => () => undefined;

export function PlanBoard({ initial }: { initial: PlanItem[] }) {
  const today = useSyncExternalStore(subscribeNoop, () => toDayString(new Date()), () => "");
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  if (!today) return <div className="h-64 animate-pulse rounded-2xl bg-card" />;

  const weekEnd = toDayString(new Date(fromDayString(today).getTime() + 6 * 86_400_000));
  const open = items.filter((i) => i.status !== "done");
  const byDate = (a: PlanItem, b: PlanItem) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`);
  const overdue = open.filter((i) => i.date && i.date < today).sort(byDate);
  const week = open.filter((i) => i.date && i.date >= today && i.date <= weekEnd).sort(byDate);
  const later = open.filter((i) => i.date && i.date > weekEnd).sort(byDate);
  const undated = open.filter((i) => !i.date).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = items.filter((i) => i.status === "done").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const weekDays = Array.from({ length: 7 }, (_, n) => toDayString(new Date(fromDayString(today).getTime() + n * 86_400_000)));

  const startNew = (date = "") => {
    setDraft(emptyDraft(date));
    setEditing("new");
    setError(null);
  };
  const startEdit = (item: PlanItem) => {
    setDraft({
      title: item.title,
      notes: item.notes,
      date: item.date ?? "",
      time: item.time ?? "",
      platforms: item.platforms,
      format: item.format,
    });
    setEditing(item.id);
    setError(null);
  };

  const save = async () => {
    if (!draft.title.trim()) return setError("اكتب عنوان الفكرة.");
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        const { item } = await apiJson<{ item: PlanItem }>("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        setItems((prev) => [...prev, item]);
      } else if (editing) {
        const { item } = await apiJson<{ item: PlanItem }>(`/api/plan/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      }
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, data: Partial<PlanItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
    try {
      await apiJson(`/api/plan/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("تحذف الفكرة؟")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await apiJson(`/api/plan/${id}`, { method: "DELETE" }).catch((err) => setError((err as Error).message));
  };

  const form = (
    <div className="space-y-3 rounded-2xl border border-accent/40 bg-card p-4">
      <input
        autoFocus
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="الفكرة… مثلاً: فيديو عن أكلة شعبية"
        dir="auto"
        className={INPUT}
      />
      <textarea
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="ملاحظات (اختياري): وش بتقول، وين بتصور، الكابشن…"
        rows={3}
        dir="auto"
        className={INPUT}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-muted">
          اليوم (اختياري)
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${INPUT} ltr`} />
        </label>
        <label className="space-y-1 text-xs text-muted">
          الوقت (اختياري)
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className={`${INPUT} ltr`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["instagram", "youtube"] as Platform[]).map((p) => {
          const on = draft.platforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() =>
                setDraft({ ...draft, platforms: on ? draft.platforms.filter((x) => x !== p) : [...draft.platforms, p] })
              }
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm ${on ? "border-ink" : "border-line opacity-60"}`}
            >
              <PlatformIcon platform={p} className="size-5 rounded-md" />
              {p === "instagram" ? "انستقرام" : "يوتيوب"}
            </button>
          );
        })}
        <select
          value={draft.format}
          onChange={(e) => setDraft({ ...draft, format: e.target.value as PlanFormat })}
          className="rounded-xl border border-line bg-field px-3 py-1.5 text-sm"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-on-ink disabled:opacity-50">
          {busy ? "جاري الحفظ…" : "حفظ"}
        </button>
        <button onClick={() => setEditing(null)} className="rounded-xl border border-line px-4 py-2.5 text-sm">
          إلغاء
        </button>
      </div>
    </div>
  );

  const card = (item: PlanItem, showDate = false) =>
    editing === item.id ? (
      <div key={item.id}>{form}</div>
    ) : (
      <div key={item.id} className="space-y-2 rounded-2xl border border-line bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p dir="auto" className={`font-medium ${item.status === "done" ? "text-muted line-through" : ""}`}>
              {item.title}
            </p>
            {item.notes && (
              <p dir="auto" className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted">
                {item.notes}
              </p>
            )}
          </div>
          <button
            onClick={() => patch(item.id, { status: STATUS[item.status].next })}
            title="غيّر الحالة"
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[item.status].cls}`}
          >
            {STATUS[item.status].label}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {item.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} className="size-4 rounded" />
          ))}
          <span className="rounded-md bg-canvas px-1.5 py-0.5">{formatLabel(item.format)}</span>
          {showDate && item.date && <span className="rounded-md bg-canvas px-1.5 py-0.5">{shortFmt.format(fromDayString(item.date))}</span>}
          {item.time && <span className="ltr rounded-md bg-canvas px-1.5 py-0.5">{item.time}</span>}
          <span className="flex-1" />
          <button onClick={() => startEdit(item)} className="px-1.5 py-0.5 hover:text-ink">
            تعديل
          </button>
          <button onClick={() => remove(item.id)} className="px-1.5 py-0.5 hover:text-danger">
            حذف
          </button>
          {item.status !== "done" && (
            <Link href={`/?idea=${item.id}`} className="rounded-lg bg-ink px-2.5 py-1 font-medium text-on-ink">
              ابدأ منشور ←
            </Link>
          )}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {editing === "new" ? (
        form
      ) : (
        <button
          onClick={() => startNew()}
          className="w-full rounded-2xl border-2 border-dashed border-line px-4 py-4 text-sm font-medium text-muted hover:bg-card hover:text-ink"
        >
          + فكرة جديدة
        </button>
      )}

      {overdue.length > 0 && (
        <Section title={`⚠️ فات وقتها (${overdue.length})`}>{overdue.map((i) => card(i, true))}</Section>
      )}

      <Section title="🗓️ هالأسبوع">
        {weekDays.map((day) => {
          const dayItems = week.filter((i) => i.date === day);
          return (
            <div key={day} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={`text-sm ${day === today ? "font-semibold text-accent" : "text-muted"}`}>
                  {day === today ? "اليوم · " : ""}
                  {dayFmt.format(fromDayString(day))}
                </p>
                <button onClick={() => startNew(day)} className="rounded-lg px-2 py-0.5 text-lg leading-none text-muted hover:bg-card hover:text-ink" aria-label="أضف فكرة لهذا اليوم">
                  +
                </button>
              </div>
              {dayItems.map((i) => card(i))}
            </div>
          );
        })}
      </Section>

      {later.length > 0 && <Section title={`📅 بعدين (${later.length})`}>{later.map((i) => card(i, true))}</Section>}

      <Section title={`💡 أفكار بدون تاريخ (${undated.length})`}>
        {undated.length ? undated.map((i) => card(i)) : <p className="text-sm text-muted">اكتب أي فكرة تجيك، وحدد لها يوم بعدين.</p>}
      </Section>

      {done.length > 0 && (
        <section className="space-y-2">
          <button onClick={() => setShowDone(!showDone)} className="text-sm font-semibold text-muted">
            {showDone ? "▾" : "◂"} المنشورة ({done.length})
          </button>
          {showDone && done.slice(0, 30).map((i) => card(i, true))}
        </section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {children}
    </section>
  );
}
