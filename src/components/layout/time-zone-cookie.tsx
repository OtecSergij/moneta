"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TIME_ZONE_COOKIE } from "@/lib/dates";

export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const pair = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}`;
    if (document.cookie.split("; ").includes(pair)) return;
    document.cookie = `${pair}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
