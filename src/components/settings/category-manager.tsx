"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCategoryAction } from "@/lib/actions/categories";
import type { Category } from "@/repositories/categories";
import { Button } from "@/components/ui/button";
import { CategoryDot } from "@/components/ui/category-dot";
import { Modal } from "@/components/ui/modal";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";

const ICON_BTN =
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-border/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

function sortByName(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function CategoryManager({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [list, setList] = useState(() => sortByName(initialCategories));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function upsert(category: Category) {
    setList((prev) => {
      const exists = prev.some((c) => c.id === category.id);
      const next = exists
        ? prev.map((c) => (c.id === category.id ? category : c))
        : [...prev, category];
      return sortByName(next);
    });
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    const res = await deleteCategoryAction(deleting.id);
    setDeleteLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setList((prev) => prev.filter((c) => c.id !== deleting.id));
    toast.success("Категория удалена");
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {list.length === 0 ? (
        <p className="text-sm text-text-muted">Категорий пока нет</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((category) => (
            <li key={category.id} className="flex items-center gap-3 py-1">
              <CategoryDot color={category.color} />
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {category.name}
              </span>
              <button
                type="button"
                aria-label={`Изменить категорию «${category.name}»`}
                onClick={() => setEditing(category)}
                className={ICON_BTN}
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Удалить категорию «${category.name}»`}
                onClick={() => setDeleting(category)}
                className={ICON_BTN}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-md px-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <Plus className="size-4" /> Новая категория
      </button>

      {creating ? (
        <CategoryFormDialog
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            upsert(c);
            setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <CategoryFormDialog
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            upsert(c);
            setEditing(null);
          }}
        />
      ) : null}

      {deleting ? (
        <Modal
          title="Удалить категорию?"
          size="sm"
          onClose={() => setDeleting(null)}
        >
          <p className="text-sm text-text-muted">
            «{deleting.name}» будет удалена без возможности восстановления.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleting(null)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteLoading}
              onClick={onConfirmDelete}
            >
              Удалить
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
