"use client";

import { useRef, useState, type MouseEvent } from "react";
import { Check, Trash2 } from "lucide-react";
import { onEnterKey } from "@/lib/enter-key";
import { ITEM_TEXT_MAX } from "@/lib/lists";
import { useLongPress } from "@/lib/hooks/use-long-press";
import type { ListItem } from "@/repositories/lists";
import { cn } from "@/lib/utils";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";

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
      <TextField
        id={`item-edit-${item.id}`}
        label="Название пункта"
        labelHidden
        size="sm"
        tone="card"
        type="text"
        autoFocus
        value={text}
        maxLength={ITEM_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => onEnterKey(e, save, onCancel)}
        onBlur={(e) => {
          if (!rowRef.current?.contains(e.relatedTarget)) onCancel();
        }}
        className="min-w-0 flex-1"
      />
      <Button
        variant="danger"
        size="sm"
        iconOnly
        aria-label="Удалить пункт"
        onMouseDown={keepFocus}
        onClick={onRemove}
        className="flex-none"
      >
        <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
      </Button>
      <Button
        size="sm"
        iconOnly
        aria-label="Сохранить"
        onMouseDown={keepFocus}
        onClick={save}
        className="flex-none"
      >
        <Check aria-hidden className="size-5" strokeWidth={1.75} />
      </Button>
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
        "flex min-h-[52px] w-full cursor-pointer items-center gap-3 pr-4 pl-[15px] text-left text-base hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
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
