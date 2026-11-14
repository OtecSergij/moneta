import { describe, expect, it } from "vitest";
import { toDayGroups } from "@/lib/day-groups";

describe("toDayGroups", () => {
  it("adds a heading to each bucket and keeps totals and items", () => {
    const now = new Date(2031, 0, 15, 12);
    const items = [{ id: "a" }, { id: "b" }];
    const buckets = [
      { day: "2031-01-14", totalMinor: 5100, unconverted: 1, items },
      { day: "2030-12-30", totalMinor: 0, unconverted: 0, items: [] },
    ];

    expect(toDayGroups(buckets, now)).toEqual([
      {
        day: "2031-01-14",
        heading: "Вторник, 14 января",
        totalMinor: 5100,
        unconverted: 1,
        items,
      },
      {
        day: "2030-12-30",
        heading: "Понедельник, 30 декабря 2030",
        totalMinor: 0,
        unconverted: 0,
        items: [],
      },
    ]);
  });
});
