import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSpace } from "@/lib/dal";
import { isUuid } from "@/lib/actions/types";
import { getList } from "@/repositories/lists";
import { AppScreen } from "@/components/layout/app-screen";
import { ListScreen } from "@/components/lists/list-screen";

export const metadata: Metadata = { title: "Список — moneta" };

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { user, spaceId } = await requireSpace();
  const list = await getList(spaceId, user.id, id);
  if (!list) notFound();

  return (
    <AppScreen tab="lists">
      <ListScreen list={list} />
    </AppScreen>
  );
}
