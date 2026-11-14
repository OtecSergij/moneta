"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { ExpenseCategory } from "@/repositories/categories";
import { Chip, ChipGroup } from "@/components/kit/chip";
import { useLongPress } from "@/lib/hooks/use-long-press";

function EditableChip({
  category,
  pressed,
  disabled,
  onSelect,
  onEdit,
}: {
  category: ExpenseCategory;
  pressed: boolean;
  disabled: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const longPress = useLongPress(onEdit);
  return (
    <Chip
      pressed={pressed}
      dotColor={category.color}
      disabled={disabled}
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
      newDisabled: boolean;
      onNewToggle: () => void;
    }
  | { editable?: false };

export function CategoryChips({
  categories,
  value,
  onChange,
  error,
  disabled = false,
  children,
  ...edit
}: {
  categories: ExpenseCategory[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
  children?: ReactNode;
} & EditProps) {
  return (
    <ChipGroup legend="Категория" error={error}>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) =>
          edit.editable ? (
            <EditableChip
              key={c.id}
              category={c}
              pressed={c.id === value}
              disabled={disabled}
              onSelect={() => onChange(c.id)}
              onEdit={() => edit.onEdit(c.id)}
            />
          ) : (
            <Chip
              key={c.id}
              pressed={c.id === value}
              dotColor={c.color}
              disabled={disabled}
              onClick={() => onChange(c.id)}
            >
              {c.name}
            </Chip>
          ),
        )}
        {edit.editable ? (
          <Chip
            variant="dashed"
            icon={<Plus className="size-4" strokeWidth={1.75} />}
            aria-expanded={edit.newOpen}
            disabled={disabled || edit.newDisabled}
            onClick={edit.onNewToggle}
          >
            Новая
          </Chip>
        ) : null}
      </div>
      {children}
    </ChipGroup>
  );
}
