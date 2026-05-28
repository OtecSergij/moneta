import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/repositories/categories";
import { mkUser } from "@/test/factories";

describe("categories repository — isolation", () => {
  it("listCategories returns only own rows", async () => {
    const a = await mkUser();
    const b = await mkUser();
    await createCategory(a.id, { name: "A-food", color: CATEGORY_COLORS[0] });
    await createCategory(b.id, { name: "B-rent", color: CATEGORY_COLORS[1] });

    const aList = await listCategories(a.id);
    const bList = await listCategories(b.id);

    expect(aList.map((c) => c.name)).toEqual(["A-food"]);
    expect(bList.map((c) => c.name)).toEqual(["B-rent"]);
  });

  it("updateCategory by another user returns null and does not modify", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const cat = await createCategory(a.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });

    const result = await updateCategory(b.id, cat.id, { name: "Hacked" });
    expect(result).toBeNull();

    // A's category is untouched.
    const [stillThere] = await listCategories(a.id);
    expect(stillThere.name).toBe("A-cat");
  });

  it("deleteCategory by another user returns not_found and does not delete", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const cat = await createCategory(a.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });

    const result = await deleteCategory(b.id, cat.id);
    expect(result).toEqual({ ok: false, reason: "not_found" });

    expect(await listCategories(a.id)).toHaveLength(1);
  });

  it("createCategory + own delete works end-to-end", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Coffee",
      description: "for the soul",
      color: CATEGORY_COLORS[7],
    });
    expect(cat.name).toBe("Coffee");
    expect(cat.description).toBe("for the soul");

    expect(await deleteCategory(u.id, cat.id)).toEqual({ ok: true });
    expect(await listCategories(u.id)).toEqual([]);
  });
});
