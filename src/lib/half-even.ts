// Half-even ("banker's") rounding, shared by the display formatter
// (@/lib/money) and the FX arithmetic (@/lib/fx/convert). One implementation
// rather than two: AC-29's reconciliation only holds while a value rounded on
// the display path and the same value rounded on the conversion path agree,
// and two copies of a tie-breaking rule drift apart silently.
//
// bigint rather than number: rates are carried at 1e20 scale, well past what a
// double represents exactly.

// `123n` literal syntax needs an ES2020 target; this project's tsconfig
// targets ES2017, so every bigint here goes through the `BigInt()` call form.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/**
 * `numerator / denominator`, rounded half to even. Every caller in this app
 * passes a non-negative numerator (the DB's CHECK constraints forbid amounts
 * <= 0), so plain truncating BigInt division already gives the floor and a
 * non-negative remainder to round from.
 */
export function divRoundHalfEven(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator;
  const twice = remainder * TWO;
  if (twice < denominator) return quotient;
  if (twice > denominator) return quotient + ONE;
  return quotient % TWO === ZERO ? quotient : quotient + ONE;
}
