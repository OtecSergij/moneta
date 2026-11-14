"use client";

import { CATEGORY_NAME_MAX } from "@/lib/categories";
import { onEnterKey } from "@/lib/enter-key";
import { firstFreeColor } from "@/lib/palette";
import type { useSheetTask } from "@/lib/hooks/use-sheet-task";
import type { ExpenseCategory } from "@/repositories/categories";
import { Button } from "@/components/kit/button";
import { ColorSwatches } from "@/components/kit/color-swatches";
import { TextField } from "@/components/kit/text-field";
import { useCategoryForm } from "@/components/categories/use-category-form";

export function NewCategoryPanel({
  categories,
  autoFocus,
  saveTask,
  onCreated,
  onCancel,
}: {
  categories: ExpenseCategory[];
  autoFocus: boolean;
  saveTask: ReturnType<typeof useSheetTask>;
  onCreated: (category: ExpenseCategory) => void;
  onCancel?: () => void;
}) {
  const { name, setName, color, setColor, nameError, saving, submit } =
    useCategoryForm({
      defaultColor: firstFreeColor(categories.map((c) => c.color)),
      saveTask,
      onSaved: onCreated,
    });

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-panel bg-page p-3.5">
      <TextField
        label="Название категории"
        labelHidden
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => onEnterKey(e, submit)}
        maxLength={CATEGORY_NAME_MAX}
        error={nameError}
        autoFocus={autoFocus}
        size="sm"
        tone="card"
        disabled={saving}
      />
      <ColorSwatches
        value={color}
        onChange={setColor}
        size="panel"
        disabled={saving}
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={onCancel}
          >
            Отмена
          </Button>
        ) : null}
        <Button
          size="sm"
          loading={saving}
          onClick={submit}
          className="min-w-[104px]"
        >
          Добавить
        </Button>
      </div>
    </div>
  );
}
