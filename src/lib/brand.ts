// Single source of truth for the brand mark used by code-generated icons
// (manifest colours + the apple-touch-icon). ACCENT mirrors `--accent` (light)
// in globals.css — CSS variables can't be read at build time, so the value is
// repeated here on purpose. The static SVGs in /public inline the same M_PATH;
// they can't import TS, so keep them in sync by hand if the mark changes.
export const ACCENT = "#2563eb";
export const ON_ACCENT = "#ffffff";

// Lowercase "m" as a vector outline on a 512×512 canvas — no <text>, so it
// rasterises identically on every platform (incl. maskable tooling).
export const M_PATH =
  "M101 360 L101 242 A92 92 0 0 1 256 175 A92 92 0 0 1 411 242 L411 360 L353 360 L353 242 A34 34 0 0 0 285 242 L285 360 L227 360 L227 242 A34 34 0 0 0 159 242 L159 360 L101 360 Z";

// The /public PNG fallbacks are rasterised from the SVGs. If the mark changes,
// update public/icon.svg + public/icon-maskable.svg to match M_PATH, then:
//   rsvg-convert -w 192 -h 192 public/icon.svg          -o public/icon-192.png
//   rsvg-convert -w 512 -h 512 public/icon.svg          -o public/icon-512.png
//   rsvg-convert -w 512 -h 512 public/icon-maskable.svg -o public/icon-maskable-512.png
