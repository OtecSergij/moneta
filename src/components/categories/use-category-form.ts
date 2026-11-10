"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_COLOR,
  type CategoryColor,
} from "@/lib/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";
import type { Category } from "@/repositories/categories";

function isPaletteColor(value: string): value is CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value);
}

export function useCategoryForm({
  category,
  defaultColor = DEFAULT_CATEGORY_COLOR,
  onSaved,
  onRemoved,
  onRemoveRejected,
}: {
  category?: Category;
  defaultColor?: CategoryColor;
  onSaved: (category: Category) => void;
  onRemoved?: (id: string) => void;
  onRemoveRejected?: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<CategoryColor>(
    category && isPaletteColor(category.color) ? category.color : defaultColor,
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const busy = useRef(false);

  async function submit() {
    if (busy.current) return;
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
    busy.current = true;
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
      busy.current = false;
      setSaving(false);
    }
  }

  async function remove() {
    if (!category || busy.current) return;
    busy.current = true;
    setRemoving(true);
    try {
      const res = await deleteCategoryAction(category.id);
      if (!res.ok) {
        toast.error(res.error);
        onRemoveRejected?.();
        return;
      }
      toast.success("Категория удалена");
      onRemoved?.(category.id);
    } finally {
      busy.current = false;
      setRemoving(false);
    }
  }

  return {
    name,
    setName,
    color,
    setColor,
    nameError,
    saving,
    removing,
    submit,
    remove,
  };
}
