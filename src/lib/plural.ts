// Russian plural agreement. `forms` = [one, few, many]:
//   one  → 1, 21, 31…  (but not 11)
//   few  → 2–4, 22–24…  (but not 12–14)
//   many → 0, 5–20, 25–30…
// e.g. plural(n, ["трата", "траты", "трат"]) → "1 трата" / "3 траты" / "8 трат".
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
