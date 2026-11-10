"use client";

import { Segment } from "@/components/kit/segment";
import {
  CURRENCY_CODES,
  currencyMeta,
  type CurrencyCode,
} from "@/lib/currency";

const OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: (
    <>
      <span aria-hidden>{currencyMeta(code).symbol}</span>
      <span className="sr-only">{code}</span>
    </>
  ),
}));

export function CurrencySegment({
  value,
  onChange,
  label,
}: {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  label: string;
}) {
  return (
    <Segment
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel={label}
      tone="symbol"
    />
  );
}
