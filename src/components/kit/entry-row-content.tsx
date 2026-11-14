import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ConvertedAmount } from "@/components/ui/converted-amount";
import { ROW_TITLE_CLASS } from "@/components/kit/list-row";

export function EntryRowContent({
  entry,
  incoming = false,
  color,
  title,
  when,
  subtitle,
  density = "regular",
}: {
  entry: ComponentProps<typeof ConvertedAmount>["entry"];
  incoming?: boolean;
  color?: string;
  title: string;
  when?: string;
  subtitle?: ReactNode;
  density?: "regular" | "compact";
}) {
  const hasMeta = Boolean(when || color || subtitle);
  const amountClass = cn(
    "flex-none",
    density === "compact" ? "text-sm" : "text-[15px]",
    "font-medium whitespace-nowrap",
  );
  return (
    <>
      {hasMeta ? (
        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            density === "compact" ? "gap-0.5" : "gap-[3px]",
          )}
        >
          <span className={ROW_TITLE_CLASS}>
            {title}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]/[16px] text-ink-2">
            {when ? <span className="flex-none">{when}</span> : null}
            {when && (color || subtitle) ? <span aria-hidden>·</span> : null}
            {color ? (
              <span
                aria-hidden
                className="size-2 flex-none rounded-chip"
                style={{ background: color }}
              />
            ) : null}
            {subtitle ? <span className="truncate">{subtitle}</span> : null}
          </span>
        </span>
      ) : (
        <span className={cn("min-w-0 flex-1", ROW_TITLE_CLASS)}>{title}</span>
      )}
      {incoming ? (
        <span className={cn(amountClass, "text-ok-ink tabular-nums")}>
          +<ConvertedAmount entry={entry} />
        </span>
      ) : (
        <ConvertedAmount entry={entry} className={cn(amountClass, "text-ink")} />
      )}
    </>
  );
}
