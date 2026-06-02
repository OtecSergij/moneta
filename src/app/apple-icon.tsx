import { ImageResponse } from "next/og";
import { ACCENT, ON_ACCENT, M_PATH } from "@/lib/brand";

// iOS «Add to Home Screen» uses apple-touch-icon (not the manifest icons) and
// ignores transparency/rounding — iOS rounds the corners itself, so this is a
// flush-filled square. Same vector mark as the manifest icons (via brand.ts),
// generated as PNG so no binary asset lives in the repo.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: ACCENT,
        }}
      >
        <svg width="180" height="180" viewBox="0 0 512 512">
          <path d={M_PATH} fill={ON_ACCENT} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
