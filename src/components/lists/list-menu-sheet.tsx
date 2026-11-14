"use client";

import { Lock, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { MenuGroup, MenuItem, MenuRow } from "@/components/kit/sheet-menu";
import { Switch } from "@/components/kit/switch";

export function ListMenuSheet({
  open,
  onOpenChange,
  name,
  isMine,
  isPrivate,
  deleting,
  savingPrivate,
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
  deleting: boolean;
  savingPrivate: boolean;
  onReset: () => void;
  onRename: () => void;
  onPrivateChange: (isPrivate: boolean) => void;
  onDelete: () => void;
}) {
  const busy = deleting || savingPrivate;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="gray"
      title={name}
      busy={busy}
    >
      <MenuGroup>
        <MenuItem
          Icon={RotateCcw}
          tone="primary"
          disabled={busy}
          onClick={onReset}
        >
          Сбросить галочки
        </MenuItem>
        <MenuItem Icon={Pencil} disabled={busy} onClick={onRename}>
          Переименовать
        </MenuItem>
        {isMine ? (
          <MenuRow
            Icon={Lock}
            labelId="list-menu-private"
            loading={savingPrivate}
            disabled={busy}
            trailing={
              <Switch
                checked={isPrivate}
                onCheckedChange={onPrivateChange}
                aria-labelledby="list-menu-private"
                aria-busy={savingPrivate || undefined}
                disabled={busy}
              />
            }
          >
            Виден только мне
          </MenuRow>
        ) : null}
      </MenuGroup>
      <MenuGroup>
        <MenuItem
          Icon={Trash2}
          tone="danger"
          loading={deleting}
          disabled={savingPrivate}
          onClick={onDelete}
        >
          Удалить список
        </MenuItem>
      </MenuGroup>
    </BottomSheet>
  );
}
