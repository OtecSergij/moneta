import { describe, expect, it } from "vitest";
import {
  currentWeekFromMonday,
  formatDayHeading,
  formatShortDate,
  isFutureISO,
  lastMonth,
  lastNDays,
  parseISODate,
  thisMonth,
  toISODate,
  todayISO,
} from "@/lib/dates";

// Fixed reference: Sunday, 17 May 2026 (local).
const NOW = new Date(2026, 4, 17);

describe("toISODate / parseISODate", () => {
  it("formats and round-trips a local date without UTC shift", () => {
    expect(toISODate(NOW)).toBe("2026-05-17");
    expect(toISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
  });

  it("does not drift across timezones (local midnight, not UTC)", () => {
    // A naive toISOString() would yield the previous day in negative offsets.
    expect(toISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("todayISO", () => {
  it("returns the reference day", () => {
    expect(todayISO(NOW)).toBe("2026-05-17");
  });
});

describe("range helpers", () => {
  it("lastNDays is inclusive of both ends", () => {
    expect(lastNDays(7, NOW)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
    expect(lastNDays(30, NOW)).toEqual({ from: "2026-04-18", to: "2026-05-17" });
    expect(lastNDays(1, NOW)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("thisMonth spans the 1st through today", () => {
    expect(thisMonth(NOW)).toEqual({ from: "2026-05-01", to: "2026-05-17" });
  });

  it("lastMonth spans the whole previous month", () => {
    expect(lastMonth(NOW)).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("lastMonth handles January -> previous December", () => {
    expect(lastMonth(new Date(2026, 0, 10))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("isFutureISO", () => {
  it("flags tomorrow but not today or yesterday", () => {
    expect(isFutureISO("2026-05-18", NOW)).toBe(true);
    expect(isFutureISO("2026-05-17", NOW)).toBe(false);
    expect(isFutureISO("2026-05-16", NOW)).toBe(false);
  });
});

describe("formatDayHeading", () => {
  it("omits the year for the current year (Russian genitive month)", () => {
    expect(formatDayHeading("2026-05-17", NOW)).toBe("17 мая");
    expect(formatDayHeading("2026-01-03", NOW)).toBe("3 января");
  });

  it("includes the year for other years", () => {
    expect(formatDayHeading("2025-05-17", NOW)).toBe("17 мая 2025");
  });
});

describe("formatShortDate", () => {
  it("renders dd.MM.yyyy", () => {
    expect(formatShortDate("2026-05-17")).toBe("17.05.2026");
    expect(formatShortDate("2026-01-03")).toBe("03.01.2026");
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
