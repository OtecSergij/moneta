import { describe, expect, it } from "vitest";
import { avatarInitial, avatarTone } from "./avatar";

describe("avatarInitial", () => {
  it("takes the first letter in upper case", () => {
    expect(avatarInitial("дмитрий")).toBe("Д");
    expect(avatarInitial("  anna ")).toBe("A");
  });

  it("keeps a surrogate pair whole", () => {
    expect(avatarInitial("𝒜lex")).toBe("𝒜");
  });

  it("falls back to ? for an empty name", () => {
    expect(avatarInitial("   ")).toBe("?");
  });
});

describe("avatarTone", () => {
  it("gives the owner blue and cycles through four pairs", () => {
    expect(avatarTone(0)).toEqual({ bg: "#E8EFFD", fg: "#1D4ED8" });
    expect(avatarTone(1)).toEqual({ bg: "#FCE7F3", fg: "#9D174D" });
    expect(avatarTone(2)).toEqual({ bg: "#DCFCE7", fg: "#166534" });
    expect(avatarTone(3)).toEqual({ bg: "#FEF3C7", fg: "#92400E" });
    expect(avatarTone(4)).toEqual(avatarTone(0));
    expect(avatarTone(9)).toEqual(avatarTone(1));
  });
});
