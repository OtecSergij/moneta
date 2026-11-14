"use client";

import { useState } from "react";

export function useSyncedState<T>(prop: T) {
  const [value, setValue] = useState(prop);
  const [seen, setSeen] = useState(prop);
  if (seen !== prop) {
    setSeen(prop);
    setValue(prop);
  }
  return [value, setValue] as const;
}
