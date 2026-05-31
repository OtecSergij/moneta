"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { GoogleButton } from "@/components/ui/google-button";

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
      <div className="my-5 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        или
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton onClick={onGoogle} loading={loading} disabled={disabled}>
        {label}
      </GoogleButton>
    </>
  );
}
