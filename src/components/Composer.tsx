"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PostStatus } from "@/components/PostStatus";
import { apiJson, makeThumbnail, mimeOf, prepareMedia, uploadFiles, type PreparedMedia } from "@/lib/client-media";
import { formatBytes, formatDuration } from "@/lib/format";
import {
  IG_CAPTION_MAX,
  IG_CAROUSEL_MAX,
  IG_MAX_HASHTAGS,
  IG_MAX_IMAGE_SIZE,
  IG_MAX_VIDEO_SIZE,
  IG_REEL_MAX_SECONDS,
  IG_REEL_MIN_SECONDS,
  MAX_FILE_SIZE,
  YT_DESCRIPTION_MAX_BYTES,
  YT_TAGS_MAX_CHARS,
  YT_TITLE_MAX,
  byteCount,
  charCount,
  hashtagCount,
  isShortsEligible,
  parseTags,
  tagsLength,
} from "@/lib/limits";
import type { Platform, YouTubePrivacy } from "@/lib/types";

interface Props {
  connected: Record<Platform, boolean>;
  initialPostId?: string;
  /** Started from an idea in the plan: prefill the caption (and the schedule time if it's in the future). */
  idea?: { id: string; title: string; notes: string; date?: string; time?: string };
}

type Phase = "edit" | "uploading" | "publishing";

const PRIVACY: { value: YouTubePrivacy; label: string }[] = [
  { value: "public", label: "عام" },
  { value: "unlisted", label: "غير مدرج" },
  { value: "private", label: "خاص" },
];

const SCHEDULE_MAX_DAYS = 60;

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return Array.from(line.replace(/[<>]/g, "").trim()).slice(0, YT_TITLE_MAX).join("");
}

// <input type="datetime-local"> works in local time "YYYY-MM-DDTHH:mm".
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return toLocalInput(d);
}

// Current time for validation, refreshed every 30 seconds (keeps render pure).
let nowValue = Date.now();
function subscribeNow(onChange: () => void) {
  nowValue = Date.now();
  const id = setInterval(() => {
    nowValue = Date.now();
    onChange();
  }, 30_000);
  return () => clearInterval(id);
}
const getNow = () => nowValue;

const friendlyDate = (value: string) =>
  new Intl.DateTimeFormat("ar", { dateStyle: "full", timeStyle: "short", calendar: "gregory", numberingSystem: "latn" }).format(
    new Date(value),
  );

export function Composer({ connected, initialPostId, idea }: Props) {
  const ideaTime = idea?.date ? `${idea.date}T${idea.time ?? "20:00"}` : "";
  const [phase, setPhase] = useState<Phase>(initialPostId ? "publishing" : "edit");
  const [postId, setPostId] = useState<string | null>(initialPostId ?? null);

  const [media, setMedia] = useState<PreparedMedia[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addMode = useRef(false);

  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    instagram: connected.instagram,
    youtube: connected.youtube,
  });
  const [unified, setUnified] = useState(true);
  const [caption, setCaption] = useState(() => (idea ? [idea.title, idea.notes].filter(Boolean).join("\n\n") : ""));
  const [ytDescription, setYtDescription] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [privacy, setPrivacy] = useState<YouTubePrivacy>("public");
  const [shorts, setShorts] = useState(true);

  const [when, setWhen] = useState<"now" | "later">(() => (ideaTime && Date.parse(ideaTime) > Date.now() + 5 * 60_000 ? "later" : "now"));
  const [scheduleAt, setScheduleAt] = useState(ideaTime);

  const [uploadPct, setUploadPct] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Free preview URLs when leaving the page.
  const mediaRef = useRef(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => () => mediaRef.current.forEach((m) => URL.revokeObjectURL(m.previewUrl)), []);
  const now = useSyncExternalStore(subscribeNow, getNow, getNow);

  // Warn before closing the tab while files are still uploading.
  useEffect(() => {
    if (phase !== "uploading") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const first = media[0];
  const kind = media.length === 0 ? null : media.length > 1 ? "carousel" : first.kind;
  const isVideo = kind === "video";
  const ig = platforms.instagram && connected.instagram;
  const yt = platforms.youtube && connected.youtube && kind === "video";
  const both = ig && yt;
  const separate = both && !unified;

  const effectiveDescription = ig && !separate ? caption : ytDescription;
  const effectiveTitle = titleTouched ? ytTitle : firstLine(ig ? caption : ytDescription);
  const tags = useMemo(() => parseTags(tagsInput), [tagsInput]);
  const shortsEligible = isVideo && isShortsEligible(first?.width, first?.height, first?.duration);

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!media.length) errors.push("اختر فيديو أو صورة.");
  if (!ig && !yt) errors.push("اختر منصة وحدة على الأقل.");
  if (ig) {
    if (charCount(caption) > IG_CAPTION_MAX) errors.push(`كابشن انستقرام أطول من ${IG_CAPTION_MAX} حرف.`);
    if (hashtagCount(caption) > IG_MAX_HASHTAGS) errors.push(`انستقرام يسمح بـ ${IG_MAX_HASHTAGS} هاشتاق كحد أقصى.`);
    if (isVideo && first.file.size > IG_MAX_VIDEO_SIZE) errors.push("فيديو انستقرام لازم يكون أقل من 300 ميقا.");
    if (media.some((m) => m.kind === "image" && m.file.size > IG_MAX_IMAGE_SIZE)) errors.push("كل صورة لازم تكون أقل من 8 ميقا.");
    if (isVideo && first.duration !== undefined) {
      if (first.duration < IG_REEL_MIN_SECONDS) warnings.push("الريل في انستقرام لازم يكون 3 ثواني أو أكثر.");
      if (first.duration > IG_REEL_MAX_SECONDS) warnings.push("الريل في انستقرام حده 15 دقيقة.");
    }
    if (isVideo && !/^video\/(mp4|quicktime)$/.test(first.file.type)) warnings.push("انستقرام يقبل MP4 أو MOV فقط.");
    const badRatio = media.filter((m) => m.kind === "image" && m.width && m.height && (m.width / m.height < 0.8 || m.width / m.height > 1.91));
    if (badRatio.length) warnings.push("بعض الصور أبعادها خارج حدود انستقرام (من 4:5 إلى 1.91:1)، وممكن ينرفض النشر.");
    if (kind === "carousel") warnings.push("انستقرام يعرض كل الصور بأبعاد أول صورة.");
  }
  if (yt) {
    if (!effectiveTitle.trim()) errors.push("اكتب عنوان ليوتيوب.");
    if (charCount(effectiveTitle) > YT_TITLE_MAX) errors.push(`عنوان يوتيوب أطول من ${YT_TITLE_MAX} حرف.`);
    if (byteCount(effectiveDescription) > YT_DESCRIPTION_MAX_BYTES) errors.push("وصف يوتيوب أطول من المسموح.");
    if (tagsLength(tags) > YT_TAGS_MAX_CHARS) errors.push(`مجموع التاقات أطول من ${YT_TAGS_MAX_CHARS} حرف.`);
  }
  if (when === "later") {
    const at = Date.parse(scheduleAt);
    if (!scheduleAt || Number.isNaN(at)) errors.push("اختر يوم ووقت الجدولة.");
    else if (at < now + 2 * 60 * 1000) errors.push("وقت الجدولة لازم يكون بعد دقيقتين على الأقل.");
    else if (at > now + SCHEDULE_MAX_DAYS * 86_400_000) errors.push(`تقدر تجدول لين ${SCHEDULE_MAX_DAYS} يوم قدام.`);
  }

  const openPicker = (add: boolean) => {
    addMode.current = add;
    inputRef.current?.click();
  };

  const pickFiles = async (list: File[], add: boolean) => {
    if (!list.length) return;
    setFileError(null);
    if (list.some((f) => f.size > MAX_FILE_SIZE)) return setFileError("في ملف أكبر من 1 جيجا.");
    const types = list.map(mimeOf);
    if (types.some((t) => !t.startsWith("video/") && !t.startsWith("image/"))) return setFileError("ارفع فيديو أو صور فقط.");

    const hasVideo = types.some((t) => t.startsWith("video/"));
    if (hasVideo && (list.length > 1 || (add && media.length))) {
      return setFileError("الفيديو ينرفع لحاله. البوست المتعدد يكون صور فقط.");
    }
    const keep = add && !hasVideo && media.every((m) => m.kind === "image") ? media : [];
    if (keep.length + list.length > IG_CAROUSEL_MAX) {
      return setFileError(`الحد ${IG_CAROUSEL_MAX} صور في البوست الواحد.`);
    }

    setPreparing(true);
    try {
      const prepared: PreparedMedia[] = [];
      for (const file of list) prepared.push(await prepareMedia(file));
      if (!keep.length) media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setMedia([...keep, ...prepared]);
      setShorts(true);
    } catch (err) {
      setFileError((err as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const removeAt = (index: number) => {
    URL.revokeObjectURL(media[index].previewUrl);
    setMedia(media.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);
  };

  const togglePlatform = (p: Platform) => {
    const next = { ...platforms, [p]: !platforms[p] };
    setPlatforms(next);
    if (!ytDescription && caption && next.youtube && !next.instagram) setYtDescription(caption);
  };

  const switchToSeparate = () => {
    if (!ytDescription) setYtDescription(caption);
    setUnified(false);
  };

  const reset = () => {
    media.forEach((m) => URL.revokeObjectURL(m.previewUrl));
    setPhase("edit");
    setPostId(null);
    setMedia([]);
    setCaption("");
    setYtDescription("");
    setYtTitle("");
    setTitleTouched(false);
    setTagsInput("");
    setUnified(true);
    setWhen("now");
    setUploadPct(0);
    setSubmitError(null);
    window.history.replaceState(null, "", "/");
  };

  const publish = async () => {
    if (errors.length || !media.length) return;
    setSubmitError(null);
    setPhase("uploading");
    setUploadPct(0);
    try {
      const thumbnail = await makeThumbnail(media[0]);
      const uploadIds = await uploadFiles(
        media.map((m) => m.file),
        (f) => setUploadPct(Math.round(f * 100)),
      );
      const selected: Platform[] = [...(ig ? (["instagram"] as const) : []), ...(yt ? (["youtube"] as const) : [])];
      const { id } = await apiJson<{ id: string }>("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadIds,
          platforms: selected,
          captionMode: separate ? "separate" : "unified",
          scheduledAt: when === "later" ? new Date(scheduleAt).toISOString() : null,
          thumbnail,
          ideaId: idea?.id,
          media: media.map((m) => ({ width: m.width, height: m.height, duration: m.duration })),
          instagram: ig ? { caption } : undefined,
          youtube: yt
            ? { title: effectiveTitle, description: effectiveDescription, tags, privacy, shorts: shorts && shortsEligible }
            : undefined,
        }),
      });
      setPostId(id);
      setPhase("publishing");
      window.history.replaceState(null, "", `/?post=${id}`);
    } catch (err) {
      setSubmitError((err as Error).message);
      setPhase("edit");
    }
  };

  if (phase === "publishing" && postId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">حالة المنشور</h1>
        <PostStatus postId={postId} onNew={reset} />
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">جاري رفع {media.length > 1 ? `${media.length} ملفات` : "الملف"}</h1>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium">{media.length > 1 ? `${media.length} صور` : first?.file.name}</span>
            <span className="ltr font-semibold text-accent">{uploadPct}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${uploadPct}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">لا تسكّر الصفحة لين يخلص الرفع. بعدها النشر يكمل في الخلفية.</p>
        </div>
      </div>
    );
  }

  const canAddImages = media.length > 0 && media.every((m) => m.kind === "image") && media.length < IG_CAROUSEL_MAX;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">منشور جديد</h1>
      {idea && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">💡 من الخطة: {idea.title}</p>
      )}

      {/* 1. Media */}
      <section className="rounded-2xl border border-line bg-card p-4">
        {media.length === 1 ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-xl bg-black sm:w-56 sm:shrink-0">
              {first.kind === "video" ? (
                <video src={first.previewUrl} controls playsInline className="max-h-80 w-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={first.previewUrl} alt="معاينة" className="max-h-80 w-full object-contain" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 text-sm">
              <div className="space-y-1">
                <p className="truncate font-medium">{first.file.name}</p>
                <p className="text-muted">
                  {first.kind === "video" ? "فيديو" : "صورة"} · {formatBytes(first.file.size)}
                  {first.width && first.height && (
                    <>
                      {" "}· <span className="ltr">{first.width}×{first.height}</span>
                    </>
                  )}
                  {first.duration !== undefined && (
                    <>
                      {" "}· <span className="ltr">{formatDuration(first.duration)}</span>
                    </>
                  )}
                </p>
                {first.converted && <p className="text-xs text-muted">تم تحويل الصورة إلى JPEG لأن انستقرام ما يقبل غيره.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openPicker(false)} className="rounded-xl border border-line px-4 py-2 font-medium hover:bg-canvas">
                  تغيير الملف
                </button>
                {canAddImages && (
                  <button onClick={() => openPicker(true)} className="rounded-xl border border-line px-4 py-2 font-medium hover:bg-canvas">
                    + إضافة صور (بوست متعدد)
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : media.length > 1 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">بوست فيه {media.length} صور</span>
              <span className="text-muted">انستقرام فقط · الترتيب مهم</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {media.map((m, i) => (
                <div key={m.previewUrl} className="group relative aspect-square overflow-hidden rounded-xl bg-canvas">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.previewUrl} alt={`صورة ${i + 1}`} className="size-full object-cover" />
                  <span className="absolute start-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <button
                    onClick={() => removeAt(i)}
                    aria-label="حذف الصورة"
                    className="absolute end-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-white/90 text-sm text-danger shadow"
                  >
                    ×
                  </button>
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="قدّم الصورة"
                      className="flex size-7 items-center justify-center rounded-full bg-white/90 text-sm text-black shadow disabled:opacity-0"
                    >
                      →
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === media.length - 1}
                      aria-label="أخّر الصورة"
                      className="flex size-7 items-center justify-center rounded-full bg-white/90 text-sm text-black shadow disabled:opacity-0"
                    >
                      ←
                    </button>
                  </div>
                </div>
              ))}
              {canAddImages && (
                <button
                  onClick={() => openPicker(true)}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-sm text-muted hover:bg-canvas"
                >
                  <span className="text-2xl leading-none">+</span>
                  إضافة
                </button>
              )}
            </div>
            <button onClick={() => openPicker(false)} className="text-sm font-medium text-accent">
              البدء من جديد
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openPicker(false)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFiles(Array.from(e.dataTransfer.files), false);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-12 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-line hover:border-muted/50 hover:bg-canvas"
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-9 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">{preparing ? "جاري تجهيز الملفات…" : "اختر فيديو، أو صورة، أو عدة صور"}</span>
            <span className="text-sm text-muted">اضغط هنا للاختيار من جهازك (لين {IG_CAROUSEL_MAX} صور)</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            pickFiles(Array.from(e.target.files ?? []), addMode.current);
            e.target.value = "";
          }}
        />
        {preparing && media.length > 0 && <p className="mt-3 text-sm text-muted">جاري تجهيز الملفات…</p>}
        {fileError && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{fileError}</p>}
      </section>

      {/* 2. Platforms */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">انشر على</h2>
        <div className="grid grid-cols-2 gap-3">
          <PlatformToggle
            platform="instagram"
            label="Instagram"
            checked={ig}
            disabledReason={!connected.instagram ? "غير مربوط" : undefined}
            onToggle={() => togglePlatform("instagram")}
          />
          <PlatformToggle
            platform="youtube"
            label="YouTube"
            checked={yt}
            disabledReason={!connected.youtube ? "غير مربوط" : kind && kind !== "video" ? "فيديو فقط" : undefined}
            onToggle={() => togglePlatform("youtube")}
          />
        </div>
        {(!connected.instagram || !connected.youtube) && (
          <p className="text-xs text-muted">
            اربط حساباتك من{" "}
            <Link href="/settings" className="font-medium text-accent underline underline-offset-2">
              الإعدادات
            </Link>
            .
          </p>
        )}
      </section>

      {/* 3. Caption */}
      {ig && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          {both && (
            <div className="flex rounded-xl bg-canvas p-1 text-sm">
              <SegButton active={unified} onClick={() => setUnified(true)}>
                كابشن موحّد
              </SegButton>
              <SegButton active={!unified} onClick={switchToSeparate}>
                مختلف لكل منصة
              </SegButton>
            </div>
          )}
          <Field
            label={both && unified ? "الكابشن (انستقرام + وصف يوتيوب)" : "كابشن انستقرام"}
            counter={`${charCount(caption)} / ${IG_CAPTION_MAX}`}
            over={charCount(caption) > IG_CAPTION_MAX}
            hint={hashtagCount(caption) ? `${hashtagCount(caption)} هاشتاق (الحد ${IG_MAX_HASHTAGS})` : undefined}
          >
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              dir="auto"
              placeholder="اكتب الكابشن هنا…"
              className="w-full resize-y rounded-xl border border-line bg-field px-3 py-2.5 leading-relaxed outline-none focus:border-accent"
            />
          </Field>
        </section>
      )}

      {/* 4. YouTube */}
      {yt && (
        <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <PlatformIcon platform="youtube" className="size-6" />
            <h2 className="font-semibold">إعدادات يوتيوب</h2>
          </div>

          <Field label="العنوان" counter={`${charCount(effectiveTitle)} / ${YT_TITLE_MAX}`} over={charCount(effectiveTitle) > YT_TITLE_MAX}>
            <input
              value={effectiveTitle}
              onChange={(e) => {
                setTitleTouched(true);
                setYtTitle(e.target.value.replace(/[<>]/g, ""));
              }}
              dir="auto"
              placeholder="عنوان الفيديو"
              className="w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-accent"
            />
            {!titleTouched && effectiveTitle && <p className="mt-1 text-xs text-muted">مأخوذ من أول سطر. عدّله إذا تبي.</p>}
          </Field>

          {ig && !separate ? (
            <div className="rounded-xl bg-canvas px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">الوصف = نفس الكابشن</span>
                <button onClick={switchToSeparate} className="font-medium text-accent">
                  تعديل الوصف
                </button>
              </div>
            </div>
          ) : (
            <Field
              label="الوصف"
              counter={`${byteCount(effectiveDescription)} / ${YT_DESCRIPTION_MAX_BYTES} بايت`}
              over={byteCount(effectiveDescription) > YT_DESCRIPTION_MAX_BYTES}
              hint="الحرف العربي = ٢ بايت"
            >
              <textarea
                value={ytDescription}
                onChange={(e) => setYtDescription(e.target.value.replace(/[<>]/g, ""))}
                rows={5}
                dir="auto"
                placeholder="وصف الفيديو…"
                className="w-full resize-y rounded-xl border border-line bg-field px-3 py-2.5 leading-relaxed outline-none focus:border-accent"
              />
            </Field>
          )}

          <Field label="التاقات" counter={`${tagsLength(tags)} / ${YT_TAGS_MAX_CHARS}`} over={tagsLength(tags) > YT_TAGS_MAX_CHARS}>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              dir="auto"
              placeholder="افصل بينها بفاصلة: سفر، تصوير، يوميات"
              className="w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-accent"
            />
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-canvas px-2.5 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-medium">الخصوصية</span>
            <div className="flex rounded-xl bg-canvas p-1 text-sm">
              {PRIVACY.map((p) => (
                <SegButton key={p.value} active={privacy === p.value} onClick={() => setPrivacy(p.value)}>
                  {p.label}
                </SegButton>
              ))}
            </div>
          </div>

          <label className={`flex items-start gap-3 rounded-xl border border-line p-3 ${shortsEligible ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={shorts && shortsEligible}
              disabled={!shortsEligible}
              onChange={(e) => setShorts(e.target.checked)}
              className="mt-1 size-4 accent-[var(--color-accent)]"
            />
            <span className="text-sm">
              <span className="block font-medium">انشره كـ Shorts</span>
              <span className="text-muted">
                {shortsEligible ? (
                  <>
                    الفيديو عمودي وأقل من ٣ دقائق. بنضيف <span className="ltr">#Shorts</span> للعنوان.
                  </>
                ) : (
                  "متاح بس للفيديو العمودي اللي مدته ٣ دقائق أو أقل."
                )}
              </span>
            </span>
          </label>
        </section>
      )}

      {/* 5. When */}
      {media.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">وقت النشر</h2>
          <div className="flex rounded-xl bg-canvas p-1 text-sm">
            <SegButton active={when === "now"} onClick={() => setWhen("now")}>
              انشر الحين
            </SegButton>
            <SegButton
              active={when === "later"}
              onClick={() => {
                setWhen("later");
                if (!scheduleAt) setScheduleAt(defaultScheduleTime());
              }}
            >
              ⏰ جدولة
            </SegButton>
          </div>
          {when === "later" && (
            <div className="space-y-1.5">
              <input
                type="datetime-local"
                value={scheduleAt}
                min={toLocalInput(new Date(now + 5 * 60 * 1000))}
                max={toLocalInput(new Date(now + SCHEDULE_MAX_DAYS * 86_400_000))}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="ltr w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-accent"
              />
              {scheduleAt && !Number.isNaN(Date.parse(scheduleAt)) && (
                <p className="text-sm text-accent">بينزل: {friendlyDate(scheduleAt)}</p>
              )}
              <p className="text-xs text-muted">ينزل تلقائياً في وقته (خلال ٥ دقايق) حتى لو جوالك مطفي.</p>
            </div>
          )}
        </section>
      )}

      {/* 6. Publish */}
      <section className="space-y-3">
        {media.length > 0 && warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            {warnings.map((w) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        )}
        {media.length > 0 && errors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        {submitError && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{submitError}</p>}
        <button
          onClick={publish}
          disabled={errors.length > 0 || preparing}
          className="w-full rounded-xl bg-ink px-4 py-3.5 text-base font-semibold text-on-ink transition hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {when === "later" ? "⏰ جدولة" : "نشر"}
          {ig && yt ? " على المنصتين" : ig ? " على انستقرام" : yt ? " على يوتيوب" : ""}
        </button>
      </section>
    </div>
  );
}

function PlatformToggle(props: {
  platform: Platform;
  label: string;
  checked: boolean;
  disabledReason?: string;
  onToggle: () => void;
}) {
  const disabled = !!props.disabledReason;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={disabled}
      onClick={props.onToggle}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition ${
        props.checked ? "border-ink bg-card ring-1 ring-ink" : "border-line bg-card hover:border-muted/40"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <PlatformIcon platform={props.platform} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{props.label}</span>
        <span className="block text-xs text-muted">{props.disabledReason ?? (props.checked ? "مختار" : "غير مختار")}</span>
      </span>
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          props.checked ? "border-ink bg-ink text-on-ink" : "border-line"
        }`}
      >
        {props.checked && (
          <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M7.6 13.4 4.2 10l-1.2 1.2 4.6 4.6 9.4-9.4-1.2-1.2z" />
          </svg>
        )}
      </span>
    </button>
  );
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Field(props: { label: string; counter?: string; over?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{props.label}</span>
        {props.counter && (
          <span className={`ltr text-xs tabular-nums ${props.over ? "font-semibold text-danger" : "text-muted"}`}>{props.counter}</span>
        )}
      </div>
      {props.children}
      {props.hint && <p className="mt-1 text-xs text-muted">{props.hint}</p>}
    </div>
  );
}
