// Postgres SQLSTATE helpers for the server-action layer.
//
// Drizzle wraps driver errors in a DrizzleQueryError and puts the original
// PostgresError (which carries `.code`) on `.cause` — so reading `.code` off the
// top-level error misses it. That's a real bug: a duplicate category name threw
// an uncaught server error instead of a friendly "имя уже есть". We walk the
// `.cause` chain to be robust to that (and any future re-wrapping).

function hasErrorCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: unknown }).code === code
  );
}

// True if `err`, or any error in its `.cause` chain, is a Postgres
// unique-violation (SQLSTATE 23505).
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e != null; e = (e as { cause?: unknown }).cause) {
    if (hasErrorCode(e, "23505")) return true;
  }
  return false;
}
