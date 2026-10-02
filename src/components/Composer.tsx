"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PostStatus } from "@/components/PostStatus";
import { apiJson, mimeOf, prepareMedia, uploadFile, type PreparedMedia } from "@/lib/client-media";
import { formatBytes, formatDuration } from "@/lib/format";
import {
  IG_CAPTION_MAX,
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
}

type Phase = "edit" | "uploading" | "publishing";

const PRIVACY: { value: YouTubePrivacy; label: string }[] = [
  { value: "public", label: "عام" },
  { value: "unlisted", label: "غير مدرج" },
  { value: "private", label: "خاص" },
];

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return Array.from(line.replace(/[<>]/g, "").trim()).slice(0, YT_TITLE_MAX).join("");
}

export function Composer({ connected, initialPostId }: Props) {
  const [phase, setPhase] = useState<Phase>(initialPostId ? "publishing" : "edit");
  const [postId, setPostId] = useState<string | null>(initialPostId ?? null);

  const [media, setMedia] = useState<PreparedMedia | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    instagram: connected.instagram,
    youtube: connected.youtube,
  });
  const [unified, setUnified] = useState(true);
  const [caption, setCaption] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [privacy, setPrivacy] = useState<YouTubePrivacy>("public");
  const [shorts, setShorts] = useState(true);

  const [uploadPct, setUploadPct] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Revoke preview URLs when the media changes.
  useEffect(() => () => void (media && URL.revokeObjectURL(media.previewUrl)), [media]);

  // Warn before closing the tab while the file is still uploading.
  useEffect(() => {
    if (phase !== "uploading") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const isVideo = media?.kind === "video";
  const ig = platforms.instagram && connected.instagram;
  const yt = platforms.youtube && connected.youtube && media?.kind !== "image";
  const both = ig && yt;
  const separate = both && !unified;

  // Description source: shared caption (unified) or its own text.
  const effectiveDescription = ig && !separate ? caption : ytDescription;
  const effectiveTitle = titleTouched ? ytTitle : firstLine(ig ? caption : ytDescription);
  const tags = useMemo(() => parseTags(tagsInput), [tagsInput]);
  const shortsEligible = isShortsEligible(media?.width, media?.height, media?.duration);

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!media) errors.push("اختر فيديو أو صورة.");
  if (!ig && !yt) errors.push("اختر منصة وحدة على الأقل.");
  if (ig) {
    if (charCount(caption) > IG_CAPTION_MAX) errors.push(`كابشن انستقرام أطول من ${IG_CAPTION_MAX} حرف.`);
    if (hashtagCount(caption) > IG_MAX_HASHTAGS) errors.push(`انستقرام يسمح بـ ${IG_MAX_HASHTAGS} هاشتاق كحد أقصى.`);
    if (media?.kind === "video" && media.file.size > IG_MAX_VIDEO_SIZE) errors.push("فيديو انستقرام لازم يكون أقل من 300 ميقا.");
    if (media?.kind === "image" && media.file.size > IG_MAX_IMAGE_SIZE) errors.push("صورة انستقرام لازم تكون أقل من 8 ميقا.");
    if (media?.kind === "video" && media.duration !== undefined) {
      if (media.duration < IG_REEL_MIN_SECONDS) warnings.push("الريل في انستقرام لازم يكون 3 ثواني أو أكثر.");
      if (media.duration > IG_REEL_MAX_SECONDS) warnings.push("الريل في انستقرام حده 15 دقيقة.");
    }
    if (media?.kind === "video" && !/^video\/(mp4|quicktime)$/.test(media.file.type)) {
      warnings.push("انستقرام يقبل MP4 أو MOV فقط.");
    }
    if (media?.kind === "image" && media.width && media.height) {
      const ratio = media.width / media.height;
      if (ratio < 0.8 || ratio > 1.91) warnings.push("نسبة أبعاد الصورة خارج حدود انستقرام (من 4:5 إلى 1.91:1)، وممكن ينرفض النشر.");
    }
  }
  if (yt) {
    if (!effectiveTitle.trim()) errors.push("اكتب عنوان ليوتيوب.");
    if (charCount(effectiveTitle) > YT_TITLE_MAX) errors.push(`عنوان يوتيوب أطول من ${YT_TITLE_MAX} حرف.`);
    if (byteCount(effectiveDescription) > YT_DESCRIPTION_MAX_BYTES) errors.push("وصف يوتيوب أطول من المسموح.");
    if (tagsLength(tags) > YT_TAGS_MAX_CHARS) errors.push(`مجموع التاقات أطول من ${YT_TAGS_MAX_CHARS} حرف.`);
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_SIZE) return setFileError("الملف أكبر من 1 جيجا.");
    const type = mimeOf(file);
    if (!type.startsWith("video/") && !type.startsWith("image/")) return setFileError("ارفع فيديو أو صورة فقط.");
    setPreparing(true);
    try {
      const prepared = await prepareMedia(file);
      setMedia(prepared);
      setShorts(true);
    } catch (err) {
      setFileError((err as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  const togglePlatform = (p: Platform) => {
    const next = { ...platforms, [p]: !platforms[p] };
    setPlatforms(next);
    // When the description stops following the caption, start it from the caption text.
    if (!ytDescription && caption && next.youtube && !next.instagram) setYtDescription(caption);
  };

  const switchToSeparate = () => {
    if (!ytDescription) setYtDescription(caption);
    setUnified(false);
  };

  const reset = () => {
    setPhase("edit");
    setPostId(null);
    setMedia(null);
    setCaption("");
    setYtDescription("");
    setYtTitle("");
    setTitleTouched(false);
    setTagsInput("");
    setUnified(true);
    setUploadPct(0);
    setSubmitError(null);
    window.history.replaceState(null, "", "/");
  };

  const publish = async () => {
    if (errors.length || !media) return;
    setSubmitError(null);
    setPhase("uploading");
    setUploadPct(0);
    try {
      const uploadId = await uploadFile(media.file, (f) => setUploadPct(Math.round(f * 100)));
      const selected: Platform[] = [...(ig ? (["instagram"] as const) : []), ...(yt ? (["youtube"] as const) : [])];
      const { id } = await apiJson<{ id: string }>("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          platforms: selected,
          captionMode: separate ? "separate" : "unified",
          media: { width: media.width, height: media.height, duration: media.duration },
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
        <h1 className="text-2xl font-bold">حالة النشر</h1>
        <PostStatus postId={postId} onNew={reset} />
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">جاري رفع الملف</h1>
        <div className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium">{media?.file.name}</span>
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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">منشور جديد</h1>

      {/* 1. Media */}
      <section className="rounded-2xl border border-line bg-card p-4">
        {media ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-xl bg-ink/95 sm:w-56 sm:shrink-0">
              {media.kind === "video" ? (
                <video src={media.previewUrl} controls playsInline className="max-h-80 w-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media.previewUrl} alt="معاينة" className="max-h-80 w-full object-contain" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 text-sm">
              <div className="space-y-1">
                <p className="truncate font-medium">{media.file.name}</p>
                <p className="text-muted">
                  {media.kind === "video" ? "فيديو" : "صورة"} · {formatBytes(media.file.size)}
                  {media.width && media.height && (
                    <>
                      {" "}· <span className="ltr">{media.width}×{media.height}</span>
                    </>
                  )}
                  {media.duration !== undefined && (
                    <>
                      {" "}· <span className="ltr">{formatDuration(media.duration)}</span>
                    </>
                  )}
                </p>
                {media.converted && <p className="text-xs text-muted">تم تحويل الصورة إلى JPEG لأن انستقرام ما يقبل غيره.</p>}
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="self-start rounded-xl border border-line px-4 py-2 font-medium hover:bg-canvas"
              >
                تغيير الملف
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-12 text-center transition ${
              dragging ? "border-accent bg-accent-soft" : "border-line hover:border-muted/50 hover:bg-canvas"
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-9 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">{preparing ? "جاري تجهيز الملف…" : "اسحب الفيديو أو الصورة هنا"}</span>
            <span className="text-sm text-muted">أو اضغط للاختيار من جهازك</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
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
            disabledReason={!connected.youtube ? "غير مربوط" : media?.kind === "image" ? "فيديو فقط" : undefined}
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
              className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 leading-relaxed outline-none focus:border-accent"
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
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
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
                className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 leading-relaxed outline-none focus:border-accent"
              />
            </Field>
          )}

          <Field label="التاقات" counter={`${tagsLength(tags)} / ${YT_TAGS_MAX_CHARS}`} over={tagsLength(tags) > YT_TAGS_MAX_CHARS}>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              dir="auto"
              placeholder="افصل بينها بفاصلة: سفر، تصوير، يوميات"
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
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

          {isVideo && (
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
          )}
        </section>
      )}

      {/* 5. Publish */}
      <section className="space-y-3">
        {media && warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            {warnings.map((w) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        )}
        {media && errors.length > 0 && (
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
          className="w-full rounded-xl bg-ink px-4 py-3.5 text-base font-semibold text-white transition hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40"
        >
          نشر{ig && yt ? " على المنصتين" : ig ? " على انستقرام" : yt ? " على يوتيوب" : ""}
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
          props.checked ? "border-ink bg-ink text-white" : "border-line"
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
