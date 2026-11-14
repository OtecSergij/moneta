import { Trash2 } from "lucide-react";
import { Button } from "@/components/kit/button";

export function SheetEditActions({
  deleteLabel,
  onDelete,
  deleting,
  saving,
}: {
  deleteLabel: string;
  onDelete: () => void;
  deleting: boolean;
  saving: boolean;
}) {
  return (
    <div className="mt-1 flex gap-2.5">
      <Button
        variant="danger"
        iconOnly
        aria-label={deleteLabel}
        loading={deleting}
        disabled={saving}
        onClick={onDelete}
      >
        <Trash2 className="size-[22px]" strokeWidth={1.75} aria-hidden />
      </Button>
      <Button
        type="submit"
        className="flex-1"
        loading={saving}
        disabled={deleting}
      >
        Сохранить
      </Button>
    </div>
  );
}
