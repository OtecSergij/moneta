import Link from "next/link";
import { Lock } from "lucide-react";
import type { ListSummary } from "@/repositories/lists";
import { cn } from "@/lib/utils";

export function ListProgress({
  done,
  total,
  trackClassName,
  okWhenComplete = true,
}: {
  done: number;
  total: number;
  trackClassName: string;
  okWhenComplete?: boolean;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span
      aria-hidden
      className={cn("block h-1 overflow-hidden rounded-chip", trackClassName)}
    >
      <span
        className={cn(
          "block h-full rounded-chip",
          okWhenComplete && total > 0 && done === total ? "bg-ok" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export function PrivateBadge() {
  return (
    <span className="flex flex-none items-center gap-1 rounded-chip bg-page py-0.5 pr-2 pl-1.5 text-xs font-medium text-ink-badge">
      <Lock aria-hidden className="size-3" strokeWidth={1.75} />
      Только мне
    </span>
  );
}

export function ListRows({ lists }: { lists: ListSummary[] }) {
  if (lists.length === 0) return null;
  return (
    <ul className="mx-4 mt-2 overflow-hidden rounded-card bg-card">
      {lists.map((list, i) => (
        <li key={list.id} className={cn(i > 0 && "border-t border-row-line")}>
          <Link
            href={`/lists/${list.id}`}
            className="flex flex-col gap-2.5 p-4 text-ink hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 truncate text-base font-semibold">
                {list.name}
              </span>
              {list.visibility === "private" ? <PrivateBadge /> : null}
              <span className="ml-auto flex-none text-sm text-ink-2 tabular-nums">
                {list.doneCount} из {list.totalCount}
              </span>
            </span>
            <ListProgress
              done={list.doneCount}
              total={list.totalCount}
              trackClassName="bg-page"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
