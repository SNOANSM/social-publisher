export type ThemeChoice = "light" | "dark" | "system";
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
