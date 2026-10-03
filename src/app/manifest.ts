import type { MetadataRoute } from "next";

// Lets the site be installed on the phone home screen as an app (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ناشر",
    short_name: "ناشر",
    description: "انشر على انستقرام ويوتيوب من مكان واحد",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#f5f5f2",
    theme_color: "#f5f5f2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
