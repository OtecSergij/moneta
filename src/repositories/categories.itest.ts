import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { DEFAULT_CATEGORY_COLOR } from "@/lib/categories";
import { todayISO } from "@/lib/dates";
import {
  CATEGORY_COLORS,
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/repositories/categories";
import { mkExpense, mkMember, mkSpaceUser } from "@/test/factories";

describe("categories repository — isolation", () => {
  it("listCategories returns only the space's rows", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    await createCategory(a.spaceId, a.user.id, {
      name: "A-food",
      color: CATEGORY_COLORS[0],
    });
    await createCategory(b.spaceId, b.user.id, {
      name: "B-rent",
      color: CATEGORY_COLORS[1],
    });

    expect((await listCategories(a.spaceId)).map((c) => c.name)).toEqual([
      "A-food",
    ]);
    expect((await listCategories(b.spaceId)).map((c) => c.name)).toEqual([
      "B-rent",
    ]);
  });

  it("getCategory from another space returns null", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const cat = await createCategory(a.spaceId, a.user.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });

    expect(await getCategory(b.spaceId, cat.id)).toBeNull();
    expect((await getCategory(a.spaceId, cat.id))?.name).toBe("A-cat");
  });

  it("the same name is allowed in two spaces", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    await createCategory(a.spaceId, a.user.id, { name: "Food" });
    await createCategory(b.spaceId, b.user.id, { name: "Food" });

    expect(await listCategories(a.spaceId)).toHaveLength(1);
    expect(await listCategories(b.spaceId)).toHaveLength(1);
  });

  it("updateCategory from another space returns null and does not modify", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const cat = await createCategory(a.spaceId, a.user.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });

    expect(await updateCategory(b.spaceId, cat.id, { name: "Hacked" })).toBeNull();

    const [stillThere] = await listCategories(a.spaceId);
    expect(stillThere.name).toBe("A-cat");
  });

  it("deleteCategory from another space returns not_found and does not delete", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const cat = await createCategory(a.spaceId, a.user.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });

    expect(await deleteCategory(b.spaceId, cat.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await listCategories(a.spaceId)).toHaveLength(1);
  });

  it("createCategory + own delete works end-to-end", async () => {
    const u = await mkSpaceUser();
    const cat = await createCategory(u.spaceId, u.user.id, {
      name: "Coffee",
      description: "for the soul",
      color: CATEGORY_COLORS[7],
    });
    expect(cat.name).toBe("Coffee");
    expect(cat.description).toBe("for the soul");
    expect(cat.createdBy).toBe(u.user.id);

    expect(await deleteCategory(u.spaceId, cat.id)).toEqual({ ok: true });
    expect(await listCategories(u.spaceId)).toEqual([]);
  });
});

describe("categories repository — shared space", () => {
  it("a member sees and edits the owner's categories", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const cat = await createCategory(owner.spaceId, owner.user.id, {
      name: "Дом",
      color: CATEGORY_COLORS[2],
    });

    expect(member.spaceId).toBe(owner.spaceId);
    expect((await listCategories(member.spaceId)).map((c) => c.id)).toEqual([
      cat.id,
    ]);
    expect(
      (await updateCategory(member.spaceId, cat.id, { name: "Квартира" }))?.name,
    ).toBe("Квартира");
  });

  it("hasExpenses counts expenses of every member", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const used = await createCategory(owner.spaceId, owner.user.id, {
      name: "Used",
    });
    await createCategory(owner.spaceId, owner.user.id, { name: "Unused" });
    await mkExpense(owner.spaceId, member.user.id, { categoryId: used.id });

    const byName = Object.fromEntries(
      (await listCategories(owner.spaceId)).map((c) => [c.name, c.hasExpenses]),
    );
    expect(byName).toEqual({ Used: true, Unused: false });
  });

  it("deleting a category with a partner's expense → has_expenses", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const cat = await createCategory(owner.spaceId, owner.user.id, {
      name: "Busy",
    });
    await mkExpense(owner.spaceId, member.user.id, { categoryId: cat.id });

    expect(await deleteCategory(owner.spaceId, cat.id)).toEqual({
      ok: false,
      reason: "has_expenses",
    });
  });

  it("an expense inserted between the check and the delete → has_expenses via 23503", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const cat = await createCategory(owner.spaceId, owner.user.id, {
      name: "Race",
    });

    const realDelete = db.delete.bind(db);
    const spy = vi.spyOn(db, "delete").mockImplementationOnce(((
      table: Parameters<typeof db.delete>[0],
    ) => {
      const builder = realDelete(table);
      const realReturning = builder.returning.bind(builder);
      return Object.assign(builder, {
        returning: (fields: Parameters<typeof realReturning>[0]) =>
          db
            .insert(expenses)
            .values({
              spaceId: owner.spaceId,
              createdBy: member.user.id,
              categoryId: cat.id,
              amountMinor: 100,
              currency: "RUB",
              note: "гонка",
              spentAt: todayISO(),
            })
            .then(() => realReturning(fields!)),
      });
    }) as unknown as typeof db.delete);

    try {
      expect(await deleteCategory(owner.spaceId, cat.id)).toEqual({
        ok: false,
        reason: "has_expenses",
      });
    } finally {
      spy.mockRestore();
    }
    expect(await getCategory(owner.spaceId, cat.id)).not.toBeNull();
  });
});

describe("createCategory — default colour", () => {
  it("takes the first palette colour not used in the space", async () => {
    const u = await mkSpaceUser();
    const other = await mkSpaceUser();
    await createCategory(other.spaceId, other.user.id, {
      name: "Elsewhere",
      color: CATEGORY_COLORS[1],
    });
    await createCategory(u.spaceId, u.user.id, {
      name: "First",
      color: CATEGORY_COLORS[0],
    });

    const second = await createCategory(u.spaceId, u.user.id, { name: "Second" });
    expect(second.color).toBe(CATEGORY_COLORS[1]);
  });

  it("falls back to DEFAULT_CATEGORY_COLOR when the whole palette is taken", async () => {
    const u = await mkSpaceUser();
    for (const [i, color] of CATEGORY_COLORS.entries()) {
      await createCategory(u.spaceId, u.user.id, { name: `C${i}`, color });
    }

    const extra = await createCategory(u.spaceId, u.user.id, { name: "Extra" });
    expect(extra.color).toBe(DEFAULT_CATEGORY_COLOR);
  });
});
