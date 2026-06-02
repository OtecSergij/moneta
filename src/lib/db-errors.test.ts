import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/db-errors";

describe("isUniqueViolation", () => {
  it("matches a top-level SQLSTATE 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches 23505 nested on .cause (Drizzle wraps the driver error)", () => {
    // The real shape we hit: DrizzleQueryError → PostgresError on `.cause`.
    const wrapped = { message: "Failed query: insert ...", cause: { code: "23505" } };
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("matches deeper in the cause chain", () => {
    expect(isUniqueViolation({ cause: { cause: { code: "23505" } } })).toBe(true);
  });

  it("ignores other Postgres error codes", () => {
    expect(isUniqueViolation({ code: "23503", cause: { code: "23502" } })).toBe(
      false,
    );
  });

  it("is safe on null, primitives and plain errors", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
  });
});
