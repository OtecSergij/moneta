// Shared result shape for server actions. Lives in a plain module (not a
// "use server" file) so it can be `import type`-ed without becoming an action.

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
