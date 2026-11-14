const EMAIL =
  /[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~.-]+@[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)+/gu;
const MASK = "[email]";

export function redactEmails<T>(value: T, copies = new WeakMap<object, object>()): T {
  if (typeof value === "string") return value.replace(EMAIL, MASK) as T;
  if (typeof value !== "object" || value === null) return value;
  const known = copies.get(value);
  if (known) return known as T;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) copy.push(redactEmails(item, copies));
    return copy as T;
  }
  if (value instanceof Error) {
    const copy = new Error(redactEmails(value.message));
    copies.set(value, copy);
    copy.name = value.name;
    copy.stack = value.stack && redactEmails(value.stack);
    if ("cause" in value) copy.cause = redactEmails(value.cause, copies);
    for (const [key, v] of Object.entries(value)) Reflect.set(copy, key, redactEmails(v, copies));
    return copy as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const [key, v] of Object.entries(value)) copy[key] = redactEmails(v, copies);
  return copy as T;
}
