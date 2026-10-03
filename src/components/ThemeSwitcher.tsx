"use client";

import { useState } from "react";
import { THEME_COOKIE, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "نهار", icon: "☀️" },
  { value: "dark", label: "ليل", icon: "🌙" },
  { value: "system", label: "تلقائي", icon: "📱" },
];

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeSwitcher({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  return (
    <div className="flex rounded-xl bg-canvas p-1 text-sm">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            setChoice(o.value);
            applyTheme(o.value);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
            choice === o.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small moon/sun button for the header: toggles between light and dark. */
export function ThemeToggleButton({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const isDark =
    choice === "dark" || (choice === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      type="button"
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      onClick={() => {
        const next: ThemeChoice = isDark ? "light" : "dark";
        setChoice(next);
        applyTheme(next);
      }}
      className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-line/60"
      suppressHydrationWarning
    >
      <span suppressHydrationWarning>{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}
