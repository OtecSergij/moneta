import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const TONE = {
  card: "rounded-card bg-card [&>*+*]:border-row-line",
  page: "rounded-field bg-page [&>*+*]:border-line",
} as const;

export function RowGroup({
  as: Tag = "ul",
  tone = "card",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "ul" | "div";
  tone?: keyof typeof TONE;
}) {
  return (
    <Tag
      className={cn(
        "overflow-hidden [&>*+*]:border-t",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
