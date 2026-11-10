"use client";

import { Trash2 } from "lucide-react";
import { CATEGORY_NAME_MAX } from "@/lib/categories";
import type {
  Category,
  CategoryWithUsage,
} from "@/repositories/categories";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { ColorSwatches } from "@/components/categories/color-swatches";
import { useCategoryForm } from "@/components/categories/use-category-form";

type Callbacks = {
  onSaved: (category: Category) => void;
  onRemoved: (id: string) => void;
  onRemoveRejected: () => void;
};

function EditForm({
  category,
  ...callbacks
}: { category: CategoryWithUsage } & Callbacks) {
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

  return (
    <>
      <TextField
        label="Название категории"
        labelHidden
        variant="title"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={CATEGORY_NAME_MAX}
        error={nameError}
      />
      <ColorSwatches value={color} onChange={setColor} size="sheet" />
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
    </>
  );
}

export function CategoryEditSheet({
  category,
  onClose,
  ...callbacks
}: {
  category: CategoryWithUsage | null;
  onClose: () => void;
} & Callbacks) {
  return (
    <BottomSheet
      open={category !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Категория"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).focus();
      }}
    >
      {category ? (
        <EditForm key={category.id} category={category} {...callbacks} />
      ) : null}
    </BottomSheet>
  );
}
