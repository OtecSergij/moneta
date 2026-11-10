import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";

describe("isUniqueViolation", () => {
  it("matches a top-level SQLSTATE 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("matches 23505 anywhere in the .cause chain (Drizzle wraps the driver error)", () => {
    // The real shape we hit: DrizzleQueryError → PostgresError on `.cause`.
    const wrapped = { message: "Failed query: insert ...", cause: { code: "23505" } };
    expect(isUniqueViolation(wrapped)).toBe(true);
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

describe("isForeignKeyViolation", () => {
  it("matches a top-level SQLSTATE 23503", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
  });

  it("matches 23503 anywhere in the .cause chain", () => {
    expect(isForeignKeyViolation({ cause: { code: "23503" } })).toBe(true);
    expect(isForeignKeyViolation({ cause: { cause: { code: "23503" } } })).toBe(
      true,
    );
  });

  it("matches 23001, raised by an ON DELETE RESTRICT key", () => {
    expect(isForeignKeyViolation({ cause: { code: "23001" } })).toBe(true);
  });

  it("ignores other Postgres error codes", () => {
    expect(isForeignKeyViolation({ code: "23505", cause: { code: "23502" } })).toBe(
      false,
    );
  });

  it("is safe on null, primitives and plain errors", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation("boom")).toBe(false);
    expect(isForeignKeyViolation(new Error("nope"))).toBe(false);
  });
});
