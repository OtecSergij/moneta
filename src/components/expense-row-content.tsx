import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";

export function ExpenseRowContent({
  categoryName,
  categoryColor,
  amountMinor,
  subtitle,
}: {
  categoryName: string;
  categoryColor: string;
  amountMinor: number;
  subtitle?: string | null;
}) {
  return (
    <>
      <CategoryDot color={categoryColor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-text">{categoryName}</span>
          <Money minor={amountMinor} className="text-sm text-text" />
        </div>
        {subtitle ? (
          <div className="truncate text-xs text-text-muted">{subtitle}</div>
        ) : null}
      </div>
    </>
  );
}
