import { describe, expect, it } from "vitest";
import { divRoundHalfEven } from "@/lib/half-even";

const div = (n: number, d: number) => Number(divRoundHalfEven(BigInt(n), BigInt(d)));

describe("divRoundHalfEven", () => {
  it("rounds non-negative values as before", () => {
    expect(div(0, 2)).toBe(0);
    expect(div(6, 2)).toBe(3);
    expect(div(7, 3)).toBe(2);
    expect(div(8, 3)).toBe(3);
    expect(div(5, 2)).toBe(2);
    expect(div(7, 2)).toBe(4);
  });

  it("rounds negative values to the nearest neighbour", () => {
    expect(div(-6, 2)).toBe(-3);
    expect(div(-7, 3)).toBe(-2);
    expect(div(-8, 3)).toBe(-3);
  });

  it("breaks negative ties to even, mirroring the positive side", () => {
    expect(div(-7, 2)).toBe(-4);
    expect(div(-5, 2)).toBe(-2);
    expect(div(-1, 2)).toBe(0);
    expect(div(-3, 2)).toBe(-2);
    expect(div(-250, 100)).toBe(-2);
    expect(div(-350, 100)).toBe(-4);
  });

  it("treats a negative denominator like a negated numerator", () => {
    expect(div(7, -2)).toBe(-4);
    expect(div(5, -2)).toBe(-2);
    expect(div(-7, -2)).toBe(4);
    expect(div(8, -3)).toBe(-3);
  });
});
