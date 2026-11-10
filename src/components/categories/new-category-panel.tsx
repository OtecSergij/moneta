"use client";

import { Loader2 } from "lucide-react";
import { CATEGORY_NAME_MAX, firstFreeColor } from "@/lib/categories";
import type { Category } from "@/repositories/categories";
import { TextField } from "@/components/kit/text-field";
import { ColorSwatches } from "@/components/categories/color-swatches";
import { useCategoryForm } from "@/components/categories/use-category-form";

export function NewCategoryPanel({
  categories,
  onCreated,
  onCancel,
}: {
  categories: Category[];
  onCreated: (category: Category) => void;
  onCancel?: () => void;
}) {
  const { name, setName, color, setColor, nameError, saving, submit } =
    useCategoryForm({
      defaultColor: firstFreeColor(categories.map((c) => c.color)),
      onSaved: onCreated,
    });

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-panel bg-page p-3.5">
      <TextField
        label="Название категории"
        labelHidden
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={CATEGORY_NAME_MAX}
        error={nameError}
        autoFocus
        className="[&>div]:h-11 [&>div]:rounded-control [&>div]:bg-card [&>div]:px-3.5"
      />
      <ColorSwatches value={color} onChange={setColor} size="panel" />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 cursor-pointer rounded-control px-4 text-[15px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-primary"
          >
            Отмена
          </button>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          aria-busy={saving || undefined}
          className="inline-flex h-11 min-w-[104px] cursor-pointer items-center justify-center rounded-control bg-primary px-[18px] text-[15px] font-semibold text-white hover:bg-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2
              className="size-5 animate-spin"
              strokeWidth={1.75}
              aria-hidden
            />
          ) : (
            "Добавить"
          )}
        </button>
      </div>
    </div>
  );
}
