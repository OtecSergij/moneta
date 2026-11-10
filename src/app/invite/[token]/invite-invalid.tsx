import Link from "next/link";
import { Link2Off } from "lucide-react";

export function InviteInvalid() {
  return (
    <main className="mt-24 flex flex-col items-center gap-3.5 rounded-sheet bg-card px-6 py-8 text-center">
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-chip bg-warn-soft text-warn-ink"
      >
        <Link2Off className="size-[30px]" strokeWidth={1.75} />
      </span>
      <h1 className="mt-1 text-2xl leading-[30px] font-bold tracking-[-0.02em]">
        Ссылка больше не работает
      </h1>
      <p className="text-[15px] leading-[22px] text-ink-2">
        Её уже использовали или заменили новой. Попросите прислать свежую
        ссылку.
      </p>
      <Link
        href="/login"
        className="mt-2.5 flex h-13 items-center justify-center self-stretch rounded-field bg-page text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Войти в moneta
      </Link>
    </main>
  );
}
