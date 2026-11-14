import { z } from "zod";

// Shared helpers for server actions. Lives in a plain module (not a
// "use server" file) so its exports don't become actions.

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ActionResultWithNotFound<T> =
  | ActionResult<T>
  | { ok: false; error: string; notFound: true };

export const INVALID = { ok: false, error: "Проверьте поля формы" } as const;

export const ACCOUNT_NOT_FOUND = { ok: false, error: "Счёт не найден", notFound: true } as const;

const Uuid = z.uuid();

export function isUuid(id: unknown): boolean {
  return Uuid.safeParse(id).success;
}
