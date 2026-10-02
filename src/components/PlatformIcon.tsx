import type { Platform } from "@/lib/types";

export function PlatformIcon({ platform, className = "size-6" }: { platform: Platform; className?: string }) {
  if (platform === "youtube") {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-[#ff0033] text-white ${className}`} aria-label="YouTube">
        <svg viewBox="0 0 24 24" className="size-1/2" fill="currentColor" aria-hidden>
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(45deg,#f9ce34,#ee2a7b_55%,#6228d7)] text-white ${className}`}
      aria-label="Instagram"
    >
      <svg viewBox="0 0 24 24" className="size-1/2" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export const PLATFORM_NAMES: Record<Platform, string> = { instagram: "انستقرام", youtube: "يوتيوب" };
