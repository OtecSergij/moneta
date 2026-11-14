import { cn } from "@/lib/utils";

export function ProgressBar({
  percent,
  color,
  height = 4,
  track = "page",
  className,
}: {
  percent: number;
  color: string;
  height?: 4 | 6;
  track?: "page" | "line";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block overflow-hidden rounded-chip",
        height === 6 ? "h-1.5" : "h-1",
        track === "line" ? "bg-line" : "bg-page",
        className,
      )}
    >
      <span
        className="block h-full rounded-chip"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </span>
  );
}
