import type { Metadata } from "next";
import { requireSpace } from "@/lib/dal";
import { listLists } from "@/repositories/lists";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ListNewButton } from "@/components/lists/list-new-sheet";
import { ListRows } from "@/components/lists/list-rows";

export const metadata: Metadata = { title: "Списки — moneta" };

export default async function ListsPage() {
  const { user, spaceId } = await requireSpace();
  const lists = await listLists(spaceId, user.id);

  return (
    <AppScreen tab="lists">
      <ScreenHeader title="Списки" action={<ListNewButton />} />
      <ListRows lists={lists} />
    </AppScreen>
  );
}
