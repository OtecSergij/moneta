"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { GoogleContinueButton } from "@/components/kit/google-continue-button";

export function GoogleSignIn({
  hasGoogle,
  label,
  disabled,
  onBusyChange,
}: {
  hasGoogle: boolean;
  label: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  if (!hasGoogle) return null;

  async function onGoogle() {
    setLoading(true);
    onBusyChange?.(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    if (error) {
      setLoading(false);
      onBusyChange?.(false);
      toast.error("Не удалось войти через Google");
    }
  }

  return (
    <>
      <GoogleContinueButton
        onClick={onGoogle}
        loading={loading}
        disabled={disabled}
      >
        {label}
      </GoogleContinueButton>
      <div aria-hidden className="flex items-center gap-3 text-[13px] text-ink-3">
        <span className="h-px flex-1 bg-line" />
        или
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
