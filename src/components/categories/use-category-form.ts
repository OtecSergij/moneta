"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { CATEGORY_NAME_MAX, type CategoryPatch } from "@/lib/categories";
import {
  DEFAULT_PALETTE_COLOR,
  toPaletteColor,
  type PaletteColor,
} from "@/lib/palette";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import type { ExpenseCategory } from "@/repositories/categories";

export function useCategoryForm({
  category,
  defaultColor = DEFAULT_PALETTE_COLOR,
  saveTask,
  onSaved,
  onRemoved,
  onRemoveRejected,
}: {
  category?: ExpenseCategory;
  defaultColor?: PaletteColor;
  saveTask?: ReturnType<typeof useSheetTask>;
  onSaved: (category: ExpenseCategory) => void;
  onRemoved?: (id: string) => void;
  onRemoveRejected?: () => void;
}) {
  const initialColor = category
    ? toPaletteColor(category.color, defaultColor)
    : defaultColor;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<PaletteColor>(initialColor);
  const [nameError, setNameError] = useState<string | undefined>();
  const ownSave = useSheetTask();
  const save = saveTask ?? ownSave;
  const removal = useSheetTask();

  async function submit() {
    if (save.pending || removal.pending) return;
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
    const patch: CategoryPatch = {};
    if (trimmed !== category?.name) patch.name = trimmed;
    if (color !== initialColor) patch.color = color;
    await save.run(async () => {
      try {
        const res = category
          ? await updateCategoryAction(category.id, patch)
          : await createCategoryAction({ name: trimmed, color });
        if (!res.ok) {
          if (category && "notFound" in res) {
            toast.error(res.error);
            onRemoved?.(category.id);
            return;
          }
          setNameError(res.error);
          return;
        }
        toast.success(category ? "Категория обновлена" : "Категория создана");
        onSaved(res.data);
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Не удалось сохранить категорию");
      }
    });
  }

  async function remove() {
    if (!category || save.pending) return;
    await removal.run(async () => {
      try {
        const res = await deleteCategoryAction(category.id);
        if (!res.ok) {
          toast.error(res.error);
          if ("notFound" in res) onRemoved?.(category.id);
          else onRemoveRejected?.();
          return;
        }
        toast.success("Категория удалена");
        onRemoved?.(category.id);
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Не удалось удалить категорию");
      }
    });
  }

  return {
    name,
    setName,
    color,
    setColor,
    nameError,
    saving: save.pending,
    removing: removal.pending,
    submit,
    remove,
  };
}
