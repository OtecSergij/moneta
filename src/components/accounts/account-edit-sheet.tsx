"use client";

import { useState } from "react";
import { ACCOUNT_NAME_MAX, type AccountPatch } from "@/lib/accounts";
import { toPaletteColor } from "@/lib/palette";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { ColorSwatches } from "@/components/kit/color-swatches";
import { TextField } from "@/components/kit/text-field";

export function AccountEditSheet({
  account,
  onClose,
  onSave,
}: {
  account: { name: string; color: string };
  onClose: () => void;
  onSave: (patch: AccountPatch) => Promise<boolean>;
}) {
  const initialColor = toPaletteColor(account.color);
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState(initialColor);
  const [nameError, setNameError] = useState<string | undefined>();
  const { pending: saving, run } = useSheetTask(onClose);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError("Введите название");
      return;
    }
    setNameError(undefined);

    const patch: AccountPatch = {};
    if (trimmed !== account.name) patch.name = trimmed;
    if (color !== initialColor) patch.color = color;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    await run(() => onSave(patch));
  }

  return (
    <BottomSheet
      onClose={onClose}
      ariaLabel="Счёт"
      focusSheet
      busy={saving}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Название счёта"
          labelHidden
          variant="title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={ACCOUNT_NAME_MAX}
          error={nameError}
          disabled={saving}
        />
        <ColorSwatches
          value={color}
          onChange={setColor}
          size="sheet"
          disabled={saving}
        />
        <Button type="submit" loading={saving}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  );
}
