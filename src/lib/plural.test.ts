import { describe, expect, it } from "vitest";
import { EXPENSE_FORMS, formatCount, plural } from "@/lib/plural";

describe("plural", () => {
  it.each([
    [0, "0 трат"],
    [1, "1 трата"],
    [2, "2 траты"],
    [5, "5 трат"],
    [11, "11 трат"],
    [12, "12 трат"],
    [14, "14 трат"],
    [21, "21 трата"],
    [22, "22 траты"],
    [111, "111 трат"],
  ])("%i → %s", (n, expected) => {
    expect(formatCount(n, EXPENSE_FORMS)).toBe(expected);
  });

  it("returns only the word", () => {
    expect(plural(3, ["пункт", "пункта", "пунктов"])).toBe("пункта");
  });
});
