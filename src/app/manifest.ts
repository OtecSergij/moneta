import type { MetadataRoute } from "next";
import { ACCENT } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "moneta — трекер расходов",
    short_name: "moneta",
    description: "Личный трекер расходов: вноси траты за пару секунд.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    dir: "ltr",
    categories: ["finance"],
    background_color: "#ffffff",
    theme_color: ACCENT,
    // SVG covers modern installs; PNG 192/512 are the raster fallback for
    // surfaces that don't rasterise SVG (older Android, shortcuts, splash).
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
