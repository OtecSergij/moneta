import type { TopUpWithConversion } from "@/lib/account-days";
import { ListRow } from "@/components/kit/list-row";
import { EntryRowContent } from "@/components/kit/entry-row-content";

export function TopUpRow({
  topUp,
  onClick,
}: {
  topUp: TopUpWithConversion;
  onClick: (topUp: TopUpWithConversion) => void;
}) {
  return (
    <ListRow onClick={() => onClick(topUp)}>
      <EntryRowContent entry={topUp} incoming title={topUp.note} />
    </ListRow>
  );
}
