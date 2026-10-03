import { signOut } from "@/auth";
import { requirePageUser } from "@/lib/session";
import { cookies } from "next/headers";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggleButton } from "@/components/ThemeSwitcher";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-on-ink">ن</span>
            <span className="font-bold">ناشر</span>
          </div>
          <NavLinks variant="top" />
          <div className="flex items-center gap-1">
          <ThemeToggleButton initial={theme} />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-line/60 hover:text-ink" title={user.email ?? ""}>
              خروج
            </button>
          </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <NavLinks variant="bottom" />
    </div>
  );
}
