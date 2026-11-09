// User-settings schemas, kept DB-free so they can be imported anywhere without
// pulling in the Postgres client. The repository (@/repositories/user-settings) re-exports
// these for server code — mirrors @/lib/categories.

import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";

// Same code list the money module renders against (@/lib/currency), so an
// unknown currency is rejected here instead of surfacing as a DB enum error.
export const DisplayCurrencyInput = z.enum(CURRENCY_CODES);
export type DisplayCurrencyInput = z.infer<typeof DisplayCurrencyInput>;
