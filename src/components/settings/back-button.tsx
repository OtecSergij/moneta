"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const modified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!modified && event.button === 0 && window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <Link
      href="/"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-0.5 rounded-control pr-2.5 pl-1 text-base font-medium text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft className="size-[22px]" strokeWidth={1.75} aria-hidden />
      Назад
    </Link>
  );
}
