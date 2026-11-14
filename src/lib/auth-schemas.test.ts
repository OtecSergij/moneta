import { describe, expect, it } from "vitest";
import { USER_NAME_MAX, isBlankName, signUpSchema } from "@/lib/auth-schemas";

function parseName(name: string) {
  return signUpSchema.safeParse({
    email: "a@b.co",
    password: "correct-horse-battery",
    name,
  });
}

describe("signUpSchema name limit", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(parseName("😀".repeat(USER_NAME_MAX)).success).toBe(true);
    expect(parseName("я".repeat(USER_NAME_MAX)).success).toBe(true);
  });

  it("rejects one code point over the limit with the form text", () => {
    for (const ch of ["😀", "я"]) {
      const res = parseName(ch.repeat(USER_NAME_MAX + 1));
      expect(res.success).toBe(false);
      expect(res.error?.issues).toEqual([
        expect.objectContaining({
          path: ["name"],
          message: "Слишком длинное имя",
        }),
      ]);
    }
  });

  it("checks the trimmed value", () => {
    expect(parseName(`  ${"😀".repeat(USER_NAME_MAX)}  `).success).toBe(true);
  });
});

describe("isBlankName", () => {
  it("is true for whitespace and invisible format characters only", () => {
    for (const name of [
      "",
      "   ",
      "\t\n",
      "\u00a0\u3000",
      "\u200b",
      "\u200c\u200d",
      "\u2060",
      "\ufeff",
      " \u200b\u00ad\u2060 ",
    ]) {
      expect(isBlankName(name), JSON.stringify(name)).toBe(true);
    }
  });

  it("is false when a visible character is left", () => {
    for (const name of ["Аня", " a ", "\u200bАня\u200d", "😀", "0"]) {
      expect(isBlankName(name), JSON.stringify(name)).toBe(false);
    }
  });
});
