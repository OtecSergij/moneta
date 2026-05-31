import { cn } from "@/lib/utils";

// Small colour dot identifying a category in lists, bars and selects.
// Decorative — the adjacent text carries the meaning, so it's aria-hidden.
export function CategoryDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
