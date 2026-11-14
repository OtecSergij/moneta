"use client";

import { useRef, useTransition } from "react";

// The task runs as a transition, so a navigation it starts (a not-found
// answer sending the user to the parent page) keeps `pending` until the page
// changes, as account deletion does.
export function useSheetTask(onClose?: () => void) {
  const [pending, startTransition] = useTransition();
  const running = useRef(false);

  function run(task: () => Promise<boolean | void>) {
    if (running.current) return Promise.resolve();
    running.current = true;
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          if (await task()) onClose?.();
        } finally {
          running.current = false;
          resolve();
        }
      });
    });
  }

  return { pending, run };
}
