import { describe, expect, it } from "vitest";
import { rateLimitProbe, tooManyAttemptsMessage } from "@/lib/auth-rate-limit";

const LATER = "Слишком много попыток. Попробуйте позже";

describe("tooManyAttemptsMessage", () => {
  it("names the wait in minutes, rounded up, when 429 carries a retry time", () => {
    expect(tooManyAttemptsMessage(429, "900")).toBe(
      "Слишком много попыток. Попробуйте через 15 минут",
    );
    expect(tooManyAttemptsMessage(429, "30")).toBe(
      "Слишком много попыток. Попробуйте через 1 минуту",
    );
    expect(tooManyAttemptsMessage(429, "61")).toBe(
      "Слишком много попыток. Попробуйте через 2 минуты",
    );
    expect(tooManyAttemptsMessage(429, "3600")).toBe(
      "Слишком много попыток. Попробуйте через 60 минут",
    );
  });

  it("says «позже» when 429 has no usable retry time", () => {
    for (const retryAfter of [null, "", "0", "-5", "soon"]) {
      expect(tooManyAttemptsMessage(429, retryAfter), String(retryAfter)).toBe(LATER);
    }
  });

  it("leaves every other status to the caller", () => {
    for (const status of [400, 401, 403, 422, 500]) {
      expect(tooManyAttemptsMessage(status, "900"), String(status)).toBeNull();
    }
  });
});

describe("rateLimitProbe", () => {
  it("reads the retry time off the failed response", () => {
    const probe = rateLimitProbe();
    probe.fetchOptions.onError({
      response: new Response(null, { status: 429, headers: { "X-Retry-After": "120" } }),
    });
    expect(probe.message(429)).toBe("Слишком много попыток. Попробуйте через 2 минуты");
  });

  it("falls back to «позже» when no response was read", () => {
    expect(rateLimitProbe().message(429)).toBe(LATER);
  });
});
