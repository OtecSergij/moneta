import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkSpaceUser, type SpaceUser } from "@/test/factories";
import { session } from "@/test/session-mock";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getCategory } from "@/repositories/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";

let me: SpaceUser;

beforeEach(async () => {
  vi.clearAllMocks();
  me = await mkSpaceUser();
  session.current = { userId: me.user.id, spaceId: me.spaceId };
});

describe("category actions", () => {
  it("create and update return exactly the category's id, name and color", async () => {
    const created = await createCategoryAction({
      name: "Кафе",
      description: "Кофе и обеды",
      color: "#F97316",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { id } = created.data;
    expect(created.data).toEqual({ id, name: "Кафе", color: "#F97316" });
    expect(await getCategory(me.spaceId, id)).toMatchObject({ description: null });

    expect(await updateCategoryAction(id, { name: "Рестораны", color: "#10B981" })).toEqual({
      ok: true,
      data: { id, name: "Рестораны", color: "#10B981" },
    });
  });

  it("delete returns no data", async () => {
    const created = await createCategoryAction({ name: "Кафе", color: "#F97316" });
    if (!created.ok) throw new Error(created.error);

    expect(await deleteCategoryAction(created.data.id)).toEqual({ ok: true, data: null });
    expect(await getCategory(me.spaceId, created.data.id)).toBeNull();
  });
});
