import { fillRateGaps, loadTodayRates } from "@/repositories/fx-rates";

// 17:00 in Belgrade in winter, 18:00 in summer: every source has published
// today's rate by then.
const DAILY_LOAD_UTC_HOUR = 16;
const GAP_PASS_UTC_HOUR = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds from `now` to the next `hour`:00 UTC; a full day when `now` is exactly on it. */
export function msUntilUtcHour(hour: number, now: Date = new Date()): number {
  const at = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour);
  return (at > now.getTime() ? at : at + DAY_MS) - now.getTime();
}

// Runs `job` every day at `hour`:00 UTC and returns the guarded run itself.
// The run never rejects, and a run that finds the previous one still going
// is skipped.
function daily(name: string, hour: number, job: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  async function run(): Promise<void> {
    if (running) {
      console.info("fx.job_skipped", name);
      return;
    }
    running = true;
    try {
      await job();
    } catch (err) {
      console.warn("fx.job_failed", name, String(err));
    } finally {
      running = false;
    }
  }
  function arm(): void {
    setTimeout(() => {
      arm();
      void run();
    }, msUntilUtcHour(hour)).unref();
  }
  arm();
  return run;
}

/** Starts the rate jobs in this server process; called once from instrumentation. */
export function startRateSchedule(): void {
  daily("daily_load", DAILY_LOAD_UTC_HOUR, () => loadTodayRates());
  const gapPass = daily("gap_pass", GAP_PASS_UTC_HOUR, () => fillRateGaps());
  void gapPass();
}
