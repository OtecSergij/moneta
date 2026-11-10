"use client";

import { useRef, useState, type MouseEvent } from "react";
import { Check, Trash2 } from "lucide-react";
import { ITEM_TEXT_MAX } from "@/lib/lists";
import { useLongPress } from "@/lib/hooks/use-long-press";
import type { ListItem } from "@/repositories/lists";
import { cn } from "@/lib/utils";

export const keepFocus = (e: MouseEvent) => e.preventDefault();

function ItemEditor({
  item,
  onSave,
  onRemove,
  onCancel,
}: {
  item: ListItem;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(item.text);

  function save() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (trimmed === item.text) onCancel();
    else onSave(trimmed);
  }

  return (
    <div
      ref={rowRef}
      className="flex min-h-[60px] items-center gap-1.5 bg-edit-row py-2 pr-2 pl-3"
    >
      <label htmlFor={`item-edit-${item.id}`} className="sr-only">
        Название пункта
      </label>
      <input
        id={`item-edit-${item.id}`}
        type="text"
        autoFocus
        value={text}
        maxLength={ITEM_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={(e) => {
          if (!rowRef.current?.contains(e.relatedTarget)) onCancel();
        }}
        className="h-11 min-w-0 flex-1 rounded-control bg-card px-3 text-base text-ink shadow-[inset_0_0_0_2px_var(--color-primary)] outline-none"
      />
      <button
        type="button"
        aria-label="Удалить пункт"
        onMouseDown={keepFocus}
        onClick={onRemove}
        className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-control bg-danger-soft text-danger-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Сохранить"
        onMouseDown={keepFocus}
        onClick={save}
        className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-control bg-primary text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Check aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function ListItemRow({
  item,
  editing,
  pending,
  onToggle,
  onEdit,
  onSave,
  onRemove,
  onCancel,
}: {
  item: ListItem;
  editing: boolean;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const longPress = useLongPress(() => {
    if (!pending) onEdit();
  });

  if (editing) {
    return (
      <ItemEditor
        item={item}
        onSave={onSave}
        onRemove={onRemove}
        onCancel={onCancel}
      />
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.checked}
      disabled={pending}
      onClick={onToggle}
      {...longPress}
      className={cn(
        "flex min-h-[52px] w-full cursor-pointer items-center gap-3 pr-4 pl-[15px] text-left text-base focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        item.checked ? "text-ink-3" : "text-ink",
        longPress.className,
      )}
    >
      {item.checked ? (
        <span className="flex size-[22px] flex-none items-center justify-center rounded-[7px] bg-bar-past text-white">
          <Check aria-hidden className="size-3.5" strokeWidth={1.75} />
        </span>
      ) : (
        <span className="size-[22px] flex-none rounded-[7px] border-2 border-check-line bg-card" />
      )}
      <span className="min-w-0 flex-1 break-words">{item.text}</span>
    </button>
  );
}
