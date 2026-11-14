"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/kit/detail-header";

function previousEntryInApp() {
  const { navigation } = window as Window & { navigation?: { canGoBack: boolean } };
  return navigation?.canGoBack === true;
}

export function BackButton() {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const modified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!modified && event.button === 0 && previousEntryInApp()) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <BackLink href="/" onClick={onClick}>
      Назад
    </BackLink>
  );
}
