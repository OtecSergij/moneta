"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_COLOR,
  type CategoryColor,
} from "@/lib/categories";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";
import type { Category } from "@/repositories/categories";

// Category.color is a DB `text` (any hex passes the format check), so narrow it
// to a palette colour for the picker — falling back to the default if a stored
// value is ever off-palette (only reachable via a manual DB write).
function isPaletteColor(value: string): value is CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value);
}

// Single source of the "create / edit a category" form: name + colour state,
// the validation, the action call and the toast. Both the inline create panel
// in the expense flow and the settings dialog render their own JSX around it.
// Passing `category` switches to edit (update) mode; omitting it is create.
export function useCategoryForm({
  category,
  onSaved,
}: {
  category?: Category;
  onSaved: (category: Category) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<CategoryColor>(
    category && isPaletteColor(category.color)
      ? category.color
      : DEFAULT_CATEGORY_COLOR,
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
    setNameError(undefined);
  }

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError("Введите название");
      return;
    }
    if (trimmed.length > CATEGORY_NAME_MAX) {
      setNameError(`Не больше ${CATEGORY_NAME_MAX} символов`);
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      const res = category
        ? await updateCategoryAction(category.id, { name: trimmed, color })
        : await createCategoryAction({ name: trimmed, color });
      if (!res.ok) {
        setNameError(res.error);
        return;
      }
      toast.success(category ? "Категория обновлена" : "Категория создана");
      onSaved(res.data);
    } finally {
      // finally, so an unexpected throw can never strand the button spinning.
      setSaving(false);
    }
  }

  return {
    name,
    setName,
    color,
    setColor,
    nameError,
    saving,
    submit,
    reset,
  };
}
