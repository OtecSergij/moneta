"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { GoogleContinueButton } from "@/components/kit/google-continue-button";

export function useGoogleErrorToast(error: string | undefined) {
  useEffect(() => {
    if (!error) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(null, "", url);
    // The Toaster subscribes in its own effect, which runs after this one on
    // first mount; a toast published earlier is dropped.
    const timer = setTimeout(() =>
      toast.error("Не удалось войти через Google", {
        id: "google-error",
        description:
          error === "account_not_linked"
            ? "У этого email уже есть аккаунт с паролем. Войдите по паролю или восстановите его."
            : undefined,
      }),
    );
    return () => clearTimeout(timer);
  }, [error]);
}

function OrDivider() {
  return (
    <div aria-hidden className="flex items-center gap-3 text-[13px] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      или
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function GoogleSignIn({
  hasGoogle,
  label,
  socialOptions,
  onBusyChange,
  onError,
  disabled = false,
}: {
  hasGoogle: boolean;
  label: string;
  socialOptions?: {
    errorCallbackURL?: string;
    additionalData?: Record<string, unknown>;
  };
  onBusyChange?: (busy: boolean) => void;
  onError?: (error: { code?: string }) => boolean;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  if (!hasGoogle) return null;

  async function onGoogle() {
    setLoading(true);
    onBusyChange?.(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      ...socialOptions,
    });
    if (error && !onError?.(error)) {
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
      <OrDivider />
    </>
  );
}
