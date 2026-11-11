"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False during SSR and the hydration render, true on every client render after
// that — including the first render of anything mounted after hydration.
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
