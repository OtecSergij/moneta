"use client";

import { CATEGORY_NAME_MAX } from "@/lib/categories";
import type { Category } from "@/repositories/categories";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { TextInput } from "@/components/ui/text-input";
import { ColorSwatches } from "@/components/categories/color-swatches";
import { useCategoryForm } from "@/components/categories/use-category-form";

// Create / edit a category in a modal (name + colour). `category` present →
// edit, absent → create. On success `onSaved` gets the row; the parent updates
// its list and unmounts this dialog.
export function CategoryFormDialog({
  category,
  onClose,
  onSaved,
}: {
  category?: Category;
  onClose: () => void;
  onSaved: (category: Category) => void;
}) {
  const { name, setName, color, setColor, nameError, saving, submit } =
    useCategoryForm({ category, onSaved });
  const isEdit = Boolean(category);

  return (
    <Modal
      title={isEdit ? "Редактировать категорию" : "Новая категория"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Field label="Название" htmlFor="category-name" error={nameError}>
          <TextInput
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Например, Еда"
            maxLength={CATEGORY_NAME_MAX}
            aria-invalid={!!nameError}
            autoFocus
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Цвет</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" loading={saving} onClick={submit}>
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
