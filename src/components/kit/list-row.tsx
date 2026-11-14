import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const ROW_TITLE_CLASS = "truncate text-[15px]/[18px] font-medium text-ink";

// A regular row's 64 px include the divider RowGroup draws on the li; the
// first row, which has none, takes that pixel as padding. Compact and tall
// rows sit below the divider.
const DENSITY = {
  compact: { item: "flex", row: "min-h-14 gap-3 px-3.5 py-[9px]" },
  regular: {
    item: "flex min-h-16",
    row: "gap-3 px-4 py-[11px] [li:first-child>&]:pt-3",
  },
  tall: { item: "flex", row: "min-h-[72px] gap-3.5 px-4 py-3" },
} as const;

export function ListRow({
  href,
  onClick,
  density = "regular",
  children,
}: {
  density?: keyof typeof DENSITY;
  children: ReactNode;
} & (
  | { href: string; onClick?: undefined }
  | { onClick: () => void; href?: undefined }
)) {
  const className = cn(
    "flex w-full cursor-pointer items-center text-left text-ink hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
    DENSITY[density].row,
  );
  return (
    <li className={DENSITY[density].item}>
      {href ? (
        <Link href={href} className={className}>
          {children}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {children}
        </button>
      )}
    </li>
  );
}
