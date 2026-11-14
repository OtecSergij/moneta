import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RowGroup } from "@/components/kit/row-group";

export function CardSection({
  id,
  title,
  as,
  titleGap = "default",
  className,
  children,
}: {
  id: string;
  title: string;
  as?: "ul" | "div";
  titleGap?: "default" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col",
        titleGap === "wide" ? "gap-2.5" : "gap-2",
        className,
      )}
    >
      <h2 id={id} className="mx-1 text-[17px] font-semibold">
        {title}
      </h2>
      <RowGroup as={as}>{children}</RowGroup>
    </section>
  );
}
