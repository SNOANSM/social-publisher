import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ناشر",
  description: "انشر على انستقرام ويوتيوب من مكان واحد",
  robots: { index: false, follow: false },
  applicationName: "ناشر",
  appleWebApp: { capable: true, title: "ناشر", statusBarStyle: "default" },
  icons: { apple: "/icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme is saved in a cookie so the page is rendered in the right colors from the start.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme={theme === "system" ? undefined : theme}
      className={`${arabic.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
