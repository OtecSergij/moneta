"use client";

import type { ReactNode } from "react";
import { Lock, Pencil, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Switch } from "@/components/kit/switch";
import { cn } from "@/lib/utils";

const ROW = "flex w-full items-center gap-3.5 px-4 py-2.5 text-left";

function Tile({ Icon, className }: { Icon: LucideIcon; className: string }) {
  return (
    <span
      className={cn(
        "flex size-9 flex-none items-center justify-center rounded-[10px]",
        className,
      )}
    >
      <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </span>
  );
}

function MenuButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        ROW,
        "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ListMenuSheet({
  open,
  onOpenChange,
  name,
  isMine,
  isPrivate,
  onReset,
  onRename,
  onPrivateChange,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  isMine: boolean;
  isPrivate: boolean;
  onReset: () => void;
  onRename: () => void;
  onPrivateChange: (isPrivate: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} variant="gray" title={name}>
      <div className="overflow-hidden rounded-group bg-card">
        <MenuButton onClick={onReset} className="min-h-[60px] text-ink">
          <Tile Icon={RotateCcw} className="bg-primary-soft text-primary-ink" />
          <span className="text-base font-medium">Сбросить галочки</span>
        </MenuButton>
        <MenuButton onClick={onRename} className="min-h-[60px] border-t border-row-line text-ink">
          <Tile Icon={Pencil} className="bg-page text-ink" />
          <span className="text-base font-medium">Переименовать</span>
        </MenuButton>
        {isMine ? (
          <div className={cn(ROW, "min-h-[60px] border-t border-row-line")}>
            <Tile Icon={Lock} className="bg-page text-ink" />
            <span id="list-menu-private" className="flex-1 text-base font-medium">
              Виден только мне
            </span>
            <Switch
              checked={isPrivate}
              onCheckedChange={onPrivateChange}
              aria-labelledby="list-menu-private"
            />
          </div>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-group bg-card">
        <MenuButton onClick={onDelete} className="min-h-14 text-danger-ink">
          <Tile Icon={Trash2} className="bg-danger-soft" />
          <span className="text-base font-medium">Удалить список</span>
        </MenuButton>
      </div>
    </BottomSheet>
  );
}
