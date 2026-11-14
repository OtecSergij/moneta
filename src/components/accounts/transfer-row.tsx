import type { TransferWithConversion } from "@/lib/account-days";
import { transferLabels } from "@/lib/transfers";
import { ListRow } from "@/components/kit/list-row";
import { EntryRowContent } from "@/components/kit/entry-row-content";

export function TransferRow({
  transfer,
  onClick,
}: {
  transfer: TransferWithConversion;
  onClick: (transfer: TransferWithConversion) => void;
}) {
  return (
    <ListRow onClick={() => onClick(transfer)}>
      <EntryRowContent
        entry={transfer}
        incoming={transfer.side === "in"}
        title="Перевод"
        subtitle={transferLabels(transfer.side, transfer.otherAccountName).subtitle}
      />
    </ListRow>
  );
}
