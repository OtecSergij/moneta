import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSpace } from "@/lib/dal";
import { getList } from "@/repositories/lists";
import { AppScreen } from "@/components/layout/app-screen";
import { ListScreen } from "@/components/lists/list-screen";

export const metadata: Metadata = { title: "Список — moneta" };

const Id = z.uuid();

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const { user, spaceId } = await requireSpace();
  const list = await getList(spaceId, user.id, id);
  if (!list) notFound();

  return (
    <AppScreen tab="lists">
      <ListScreen list={list} />
    </AppScreen>
  );
}
