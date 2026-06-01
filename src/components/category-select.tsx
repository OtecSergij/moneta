"use client";

import { useState } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_COLOR,
  type CategoryColor,
} from "@/lib/categories";
import { createCategoryAction } from "@/lib/actions/categories";
import type { Category } from "@/repositories/categories";
import { Button } from "@/components/ui/button";
import { CategoryDot } from "@/components/ui/category-dot";
import { TextInput } from "@/components/ui/text-input";
import { ColorSwatches } from "@/components/color-swatches";
import { cn } from "@/lib/utils";

const NEW = "__new__";

export function CategorySelect({
  categories,
  value,
  onChange,
  onCreated,
  error,
  disabled,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (category: Category) => void;
  error?: string;
  disabled?: boolean;
}) {
  const empty = categories.length === 0;
  const [creating, setCreating] = useState(empty);
  const [name, setName] = useState("");
  const [color, setColor] = useState<CategoryColor>(DEFAULT_CATEGORY_COLOR);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const selected = categories.find((c) => c.id === value);
  const labelId = "category-label";
  const errorId = "category-error";

  function resetCreate() {
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
    setNameError(undefined);
  }

  async function onCreate() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError("Введите название");
      return;
    }
    if (trimmed.length > CATEGORY_NAME_MAX) {
      setNameError(`Не больше ${CATEGORY_NAME_MAX} символов`);
      return;
    }
    setSaving(true);
    setNameError(undefined);
    const res = await createCategoryAction({ name: trimmed, color });
    setSaving(false);
    if (!res.ok) {
      setNameError(res.error);
      return;
    }
    onCreated(res.data);
    resetCreate();
    setCreating(false);
    toast.success("Категория создана");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-text">
        Категория
      </span>

      {creating ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3">
          {empty ? (
            <p className="text-sm text-text-muted">
              Создайте первую категорию, чтобы добавить трату
            </p>
          ) : null}
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter inside the create field must not submit the outer
              // expense form — create the category instead.
              if (e.key === "Enter") {
                e.preventDefault();
                onCreate();
              }
            }}
            placeholder="Например, Еда"
            maxLength={CATEGORY_NAME_MAX}
            aria-label="Название категории"
            aria-invalid={!!nameError}
            autoFocus
          />
          <ColorSwatches value={color} onChange={setColor} />
          {nameError ? (
            <p className="text-sm text-danger" role="alert">
              {nameError}
            </p>
          ) : null}
          <div className="flex gap-2">
            {!empty ? (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setCreating(false);
                  resetCreate();
                }}
              >
                Отмена
              </Button>
            ) : null}
            <Button
              type="button"
              className="flex-1"
              loading={saving}
              onClick={onCreate}
            >
              Создать
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Select.Root
            value={value}
            disabled={disabled}
            onValueChange={(v) => {
              if (v === NEW) {
                setCreating(true);
                return;
              }
              onChange(v);
            }}
          >
            <Select.Trigger
              aria-labelledby={labelId}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-surface-raised px-3 text-base text-text",
                "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
                "disabled:cursor-not-allowed disabled:opacity-60",
                error ? "border-danger" : "border-border",
              )}
            >
              {selected ? (
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryDot color={selected.color} />
                  <span className="truncate">{selected.name}</span>
                </span>
              ) : (
                <span className="text-text-muted">Выберите категорию</span>
              )}
              <Select.Icon className="shrink-0">
                <ChevronDown className="size-4 text-text-muted" />
              </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg"
              >
                <Select.Viewport className="max-h-72 overflow-y-auto p-1">
                  {categories.map((c) => (
                    <Select.Item
                      key={c.id}
                      value={c.id}
                      className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-base text-text outline-none data-[highlighted]:bg-accent/10 data-[state=checked]:font-medium"
                    >
                      <CategoryDot color={c.color} />
                      <Select.ItemText>{c.name}</Select.ItemText>
                      <Select.ItemIndicator className="ml-auto">
                        <Check className="size-4 text-accent" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}

                  <Select.Separator className="my-1 h-px bg-border" />

                  <Select.Item
                    value={NEW}
                    className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-base text-accent outline-none data-[highlighted]:bg-accent/10"
                  >
                    <Plus className="size-4" />
                    <Select.ItemText>Создать новую…</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
          {error ? (
            <p id={errorId} className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
