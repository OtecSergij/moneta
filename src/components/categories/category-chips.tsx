"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Category } from "@/repositories/categories";
import { Chip } from "@/components/kit/chip";
import { useLongPress } from "@/lib/hooks/use-long-press";
import { cn } from "@/lib/utils";

function EditableChip({
  category,
  pressed,
  onSelect,
  onEdit,
}: {
  category: Category;
  pressed: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const longPress = useLongPress(onEdit);
  return (
    <Chip
      pressed={pressed}
      dotColor={category.color}
      onClick={onSelect}
      {...longPress}
    >
      {category.name}
    </Chip>
  );
}

type EditProps =
  | {
      editable: true;
      onEdit: (id: string) => void;
      newOpen: boolean;
      onNewToggle: () => void;
    }
  | { editable?: false };

export function CategoryChips({
  categories,
  value,
  onChange,
  error,
  children,
  ...edit
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  children?: ReactNode;
} & EditProps) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Категория</legend>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) =>
          edit.editable ? (
            <EditableChip
              key={c.id}
              category={c}
              pressed={c.id === value}
              onSelect={() => onChange(c.id)}
              onEdit={() => edit.onEdit(c.id)}
            />
          ) : (
            <Chip
              key={c.id}
              pressed={c.id === value}
              dotColor={c.color}
              onClick={() => onChange(c.id)}
            >
              {c.name}
            </Chip>
          ),
        )}
        {edit.editable ? (
          <button
            type="button"
            aria-expanded={edit.newOpen}
            onClick={edit.onNewToggle}
            className={cn(
              "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-chip border border-dashed bg-card pr-3.5 pl-2.5 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              edit.newOpen
                ? "border-primary text-primary-ink"
                : "border-bar-past text-ink",
            )}
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
            Новая
          </button>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
