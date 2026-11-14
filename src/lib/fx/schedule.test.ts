import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/repositories/fx-rates", () => ({
  fillRateGaps: vi.fn(async () => 0),
  loadTodayRates: vi.fn(async () => true),
}));

import { fillRateGaps, loadTodayRates } from "@/repositories/fx-rates";
import { msUntilUtcHour, startRateSchedule } from "./schedule";

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;

describe("msUntilUtcHour", () => {
  it("counts to the next 16:00 UTC, a full day when it is exactly 16:00", () => {
    expect(msUntilUtcHour(16, new Date("2026-11-14T15:59:59.999Z"))).toBe(1);
    expect(msUntilUtcHour(16, new Date("2026-11-14T16:00:00.000Z"))).toBe(24 * HOUR);
    expect(msUntilUtcHour(16, new Date("2026-11-14T16:00:00.001Z"))).toBe(24 * HOUR - 1);
    expect(msUntilUtcHour(16, new Date("2026-11-14T03:00:00Z"))).toBe(13 * HOUR);
  });

  it("counts to the next 02:00 UTC, across midnight and the year end", () => {
    expect(msUntilUtcHour(2, new Date("2026-11-14T01:59:59.999Z"))).toBe(1);
    expect(msUntilUtcHour(2, new Date("2026-11-14T02:00:00.000Z"))).toBe(24 * HOUR);
    expect(msUntilUtcHour(2, new Date("2026-11-14T02:00:00.001Z"))).toBe(24 * HOUR - 1);
    expect(msUntilUtcHour(2, new Date("2026-12-31T23:00:00Z"))).toBe(3 * HOUR);
  });
});

describe("startRateSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs the gap pass at start, the daily load at 16:00 and the gap pass again at 02:00", async () => {
    startRateSchedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(fillRateGaps).toHaveBeenCalledTimes(1);
    expect(loadTodayRates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
    expect(loadTodayRates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(loadTodayRates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * HOUR);
    expect(fillRateGaps).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(loadTodayRates).toHaveBeenCalledTimes(2);
    expect(fillRateGaps).toHaveBeenCalledTimes(3);
  });

  it("skips a run while the previous one is still going, and survives a job that rejects", async () => {
    let finish!: () => void;
    vi.mocked(fillRateGaps).mockImplementationOnce(
      () => new Promise<number>((resolve) => (finish = () => resolve(0))),
    );
    vi.mocked(loadTodayRates).mockRejectedValueOnce(new Error("db down"));

    startRateSchedule();
    await vi.advanceTimersByTimeAsync(16 * HOUR);
    expect(console.warn).toHaveBeenCalledWith("fx.job_failed", "daily_load", "Error: db down");
    expect(fillRateGaps).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith("fx.job_skipped", "gap_pass");

    finish();
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(fillRateGaps).toHaveBeenCalledTimes(2);
    expect(loadTodayRates).toHaveBeenCalledTimes(2);
  });
});
