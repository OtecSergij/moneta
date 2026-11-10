export type PluralForms = readonly [one: string, few: string, many: string];

export const EXPENSE_FORMS: PluralForms = ["трата", "траты", "трат"];

export function plural(n: number, [one, few, many]: PluralForms): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatCount(n: number, forms: PluralForms): string {
  return `${n} ${plural(n, forms)}`;
}
