import { describe, expect, it } from "vitest";
import {
  RANGE_PRESETS,
  currentMonthFromFirst,
  currentWeekFromMonday,
  formatChipDate,
  formatDayTitle,
  formatRelativeDay,
  isFutureISO,
  parseISODate,
  resolveHistoryRange,
  toISODate,
  todayRange,
  weekRange,
  weekRangeLabel,
  zonedNow,
} from "@/lib/dates";

// Fixed reference: Sunday, 17 May 2026 (local).
const NOW = new Date(2026, 4, 17);

describe("toISODate / parseISODate", () => {
  it("formats and round-trips a local date without UTC shift", () => {
    expect(toISODate(NOW)).toBe("2026-05-17");
    // A naive toISOString() would yield the previous day in negative offsets.
    expect(toISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
    expect(toISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("range helpers", () => {
  it("todayRange collapses to a single day", () => {
    expect(todayRange(NOW)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("currentMonthFromFirst spans the 1st through the reference day", () => {
    expect(currentMonthFromFirst(NOW)).toEqual({
      from: "2026-05-01",
      to: "2026-05-17",
    });
    expect(currentMonthFromFirst(new Date(2026, 1, 28))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("currentMonthFromFirst collapses to a single day on the 1st", () => {
    expect(currentMonthFromFirst(new Date(2026, 5, 1))).toEqual({
      from: "2026-06-01",
      to: "2026-06-01",
    });
  });
});

describe("RANGE_PRESETS", () => {
  it("offers today, the week from Monday and the month from the 1st", () => {
    // Wednesday 13 May 2026.
    const wednesday = new Date(2026, 4, 13);
    expect(
      RANGE_PRESETS.map((p) => [p.label, p.range(wednesday)]),
    ).toEqual([
      ["Сегодня", { from: "2026-05-13", to: "2026-05-13" }],
      ["За неделю", { from: "2026-05-11", to: "2026-05-13" }],
      ["За месяц", { from: "2026-05-01", to: "2026-05-13" }],
    ]);
  });
});

describe("resolveHistoryRange", () => {
  it("keeps a valid range from the URL", () => {
    expect(resolveHistoryRange("2026-05-01", "2026-05-10", NOW)).toEqual({
      from: "2026-05-01",
      to: "2026-05-10",
    });
  });

  it("defaults to the week from Monday for missing, invalid or reversed params", () => {
    // Wednesday 13 May 2026 -> Monday 11 May.
    const wednesday = new Date(2026, 4, 13);
    const week = { from: "2026-05-11", to: "2026-05-13" };
    expect(resolveHistoryRange(undefined, undefined, wednesday)).toEqual(week);
    expect(resolveHistoryRange("2026-02-30", "2026-05-10", wednesday)).toEqual(week);
    expect(resolveHistoryRange("2026-05-10", "2026-05-01", wednesday)).toEqual(week);
  });
});

describe("isFutureISO", () => {
  it("flags tomorrow but not today or yesterday", () => {
    expect(isFutureISO("2026-05-18", NOW)).toBe(true);
    expect(isFutureISO("2026-05-17", NOW)).toBe(false);
    expect(isFutureISO("2026-05-16", NOW)).toBe(false);
  });
});

describe("formatRelativeDay", () => {
  it("returns 'Сегодня' for today", () => {
    expect(formatRelativeDay("2026-05-17", NOW)).toBe("Сегодня");
  });

  it("returns 'Вчера' for yesterday, even across the week boundary", () => {
    expect(formatRelativeDay("2026-05-16", NOW)).toBe("Вчера");
    expect(formatRelativeDay("2026-05-10", new Date(2026, 4, 11))).toBe("Вчера");
  });

  it("returns the weekday name for earlier days of the current week", () => {
    expect(formatRelativeDay("2026-05-15", NOW)).toBe("Пятница");
    expect(formatRelativeDay("2026-05-11", NOW)).toBe("Понедельник");
  });

  it("falls back to the date before this week's Monday", () => {
    const thursday = new Date(2026, 4, 14);
    expect(formatRelativeDay("2026-05-10", thursday)).toBe("10 мая");
    expect(formatRelativeDay("2026-05-10", NOW)).toBe("10 мая");
    expect(formatRelativeDay("2025-05-10", NOW)).toBe("10 мая 2025");
  });
});

describe("currentWeekFromMonday", () => {
  it("spans Monday through the reference day midweek", () => {
    // Wednesday 13 May 2026 -> Monday 11 May.
    expect(currentWeekFromMonday(new Date(2026, 4, 13))).toEqual({
      from: "2026-05-11",
      to: "2026-05-13",
    });
  });

  it("includes the whole week when the reference day is Sunday", () => {
    expect(currentWeekFromMonday(NOW)).toEqual({
      from: "2026-05-11",
      to: "2026-05-17",
    });
  });

  it("collapses to a single day on Monday", () => {
    expect(currentWeekFromMonday(new Date(2026, 4, 11))).toEqual({
      from: "2026-05-11",
      to: "2026-05-11",
    });
  });
});

describe("weekRange", () => {
  it("spans Monday through Sunday around a midweek day", () => {
    expect(weekRange(new Date(2026, 10, 10))).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("keeps Sunday in the week that started on Monday", () => {
    expect(weekRange(NOW)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
  });
});

describe("weekRangeLabel", () => {
  it("collapses the month inside one month", () => {
    expect(weekRangeLabel({ from: "2026-11-09", to: "2026-11-15" })).toBe(
      "9–15 ноября",
    );
  });

  it("names both months across a month boundary", () => {
    expect(weekRangeLabel({ from: "2026-10-27", to: "2026-11-02" })).toBe(
      "27 октября – 2 ноября",
    );
  });

  it("adds years across a year boundary", () => {
    expect(weekRangeLabel({ from: "2025-12-29", to: "2026-01-04" })).toBe(
      "29 декабря 2025 – 4 января 2026",
    );
  });
});

describe("formatChipDate", () => {
  const TUESDAY = new Date(2026, 10, 10);

  it("shows a short weekday and the date without a year in the current year", () => {
    expect(formatChipDate("2026-11-10", TUESDAY)).toBe("Вт, 10 ноября");
    expect(formatChipDate("2026-11-08", TUESDAY)).toBe("Вс, 8 ноября");
  });

  it("adds the year outside the current year", () => {
    expect(formatChipDate("2025-11-10", TUESDAY)).toBe("Пн, 10 ноября 2025");
  });
});

describe("formatDayTitle", () => {
  const TUESDAY = new Date(2026, 10, 10);

  it("shows the full capitalized weekday and the date", () => {
    expect(formatDayTitle("2026-11-10", TUESDAY)).toBe("Вторник, 10 ноября");
  });

  it("adds the year outside the current year", () => {
    expect(formatDayTitle("2025-11-10", TUESDAY)).toBe("Понедельник, 10 ноября 2025");
  });
});

describe("zonedNow", () => {
  const instant = new Date(Date.UTC(2026, 10, 9, 23, 30));

  it("returns the wall clock of the given zone", () => {
    expect(toISODate(zonedNow("Europe/Belgrade", instant))).toBe("2026-11-10");
    expect(toISODate(zonedNow("America/New_York", instant))).toBe("2026-11-09");
    expect(zonedNow("Europe/Belgrade", instant).getHours()).toBe(0);
  });

  it("leaves the instant as is for a missing or unknown zone", () => {
    expect(zonedNow(undefined, instant)).toBe(instant);
    expect(zonedNow("Not/AZone", instant)).toBe(instant);
  });
});
