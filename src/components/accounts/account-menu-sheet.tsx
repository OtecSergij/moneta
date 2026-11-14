"use client";

import { ArrowLeftRight, Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { MenuGroup, MenuItem } from "@/components/kit/sheet-menu";

export function AccountMenuSheet({
  name,
  canDelete,
  deleting,
  onClose,
  onTopUp,
  onTransfer,
  onBalance,
  onEdit,
  onDelete,
}: {
  name: string;
  canDelete: boolean;
  deleting: boolean;
  onClose: () => void;
  onTopUp: () => void;
  onTransfer?: () => void;
  onBalance: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <BottomSheet
      onClose={onClose}
      variant="gray"
      title={name}
      busy={deleting}
    >
      <MenuGroup>
        <MenuItem
          Icon={Plus}
          tone="primary"
          disabled={deleting}
          onClick={onTopUp}
        >
          Пополнить
        </MenuItem>
        {onTransfer ? (
          <MenuItem Icon={ArrowLeftRight} disabled={deleting} onClick={onTransfer}>
            Перевести
          </MenuItem>
        ) : null}
        <MenuItem Icon={Calculator} disabled={deleting} onClick={onBalance}>
          Уточнить остаток
        </MenuItem>
        <MenuItem Icon={Pencil} disabled={deleting} onClick={onEdit}>
          Изменить
        </MenuItem>
      </MenuGroup>
      {canDelete ? (
        <MenuGroup>
          <MenuItem
            Icon={Trash2}
            tone="danger"
            loading={deleting}
            onClick={onDelete}
          >
            Удалить счёт
          </MenuItem>
        </MenuGroup>
      ) : null}
    </BottomSheet>
  );
}
