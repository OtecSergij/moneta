"use client";

import { useState } from "react";

export function useLeaving(pending: boolean) {
  const [leaving, setLeaving] = useState(false);
  return { busy: pending || leaving, leave: () => setLeaving(true) };
}
