import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";

// Generic two-line expense row: optional colour dot + title over an optional
// subtitle + amount. Every list leads with the description (business-spec §5.2);
// the dot is omitted in History "По категориям" where the category is the group.
export function ExpenseRowContent({
  color,
  title,
  subtitle,
  amountMinor,
}: {
  color?: string;
  title: string;
  subtitle?: string | null;
  amountMinor: number;
}) {
  return (
    <>
      {color ? <CategoryDot color={color} /> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">{title}</div>
        {subtitle ? (
          <div className="truncate text-xs text-text-muted">{subtitle}</div>
        ) : null}
      </div>
      <Money minor={amountMinor} className="shrink-0 text-sm text-text" />
    </>
  );
}
