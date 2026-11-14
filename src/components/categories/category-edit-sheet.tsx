"use client";

import { Trash2 } from "lucide-react";
import { CATEGORY_NAME_MAX } from "@/lib/categories";
import { onEnterKey } from "@/lib/enter-key";
import type {
  CategoryWithUsage,
  ExpenseCategory,
} from "@/repositories/categories";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { ColorSwatches } from "@/components/kit/color-swatches";
import { TextField } from "@/components/kit/text-field";
import { useCategoryForm } from "@/components/categories/use-category-form";

type Callbacks = {
  onSaved: (category: ExpenseCategory) => void;
  onRemoved: (id: string) => void;
  onRemoveRejected: () => void;
};

function EditSheet({
  category,
  onClose,
  ...callbacks
}: { category: CategoryWithUsage; onClose: () => void } & Callbacks) {
  const {
    name,
    setName,
    color,
    setColor,
    nameError,
    saving,
    removing,
    submit,
    remove,
  } = useCategoryForm({ category, ...callbacks });
  const busy = saving || removing;

  return (
    <BottomSheet
      onClose={onClose}
      ariaLabel="Категория"
      focusSheet
      busy={busy}
    >
      <TextField
        label="Название категории"
        labelHidden
        variant="title"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => onEnterKey(e, submit)}
        maxLength={CATEGORY_NAME_MAX}
        error={nameError}
        disabled={busy}
      />
      <ColorSwatches
        value={color}
        onChange={setColor}
        size="sheet"
        disabled={busy}
      />
      <div className="flex gap-2">
        {!category.hasExpenses ? (
          <Button
            variant="danger"
            iconOnly
            aria-label="Удалить категорию"
            loading={removing}
            disabled={saving}
            onClick={remove}
          >
            <Trash2 className="size-[22px]" strokeWidth={1.75} aria-hidden />
          </Button>
        ) : null}
        <Button
          className="flex-1"
          loading={saving}
          disabled={removing}
          onClick={submit}
        >
          Сохранить
        </Button>
      </div>
    </BottomSheet>
  );
}

export function CategoryEditSheet({
  category,
  ...props
}: {
  category: CategoryWithUsage | null;
  onClose: () => void;
} & Callbacks) {
  return category ? (
    <EditSheet key={category.id} category={category} {...props} />
  ) : null;
}
