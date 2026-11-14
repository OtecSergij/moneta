"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { rateLimitProbe } from "@/lib/auth-rate-limit";
import { loginSchema, type LoginValues } from "@/lib/auth-schemas";
import { useLeaving } from "@/lib/hooks/use-leaving";
import { AuthCard } from "@/components/ui/auth-card";
import { AuthLink } from "@/components/ui/auth-link";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { GoogleSignIn, useGoogleErrorToast } from "@/components/google-sign-in";

export function LoginForm({
  hasGoogle,
  googleError,
}: {
  hasGoogle: boolean;
  googleError?: string;
}) {
  const router = useRouter();
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const { busy, leave } = useLeaving(isSubmitting);
  useGoogleErrorToast(googleError);

  async function onSubmit(values: LoginValues) {
    const limit = rateLimitProbe();
    const { error } = await authClient.signIn.email(
      { email: values.email, password: values.password },
      limit.fetchOptions,
    );
    if (error) {
      // The limit is per IP and path, so naming it reveals nothing about the
      // address. EMAIL_NOT_VERIFIED is safe to surface (user proved they know
      // the password); everything else stays generic to avoid enumeration.
      const tooMany = limit.message(error.status);
      if (tooMany) {
        toast.error(tooMany);
      } else if (error.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Подтвердите email — мы отправили ссылку на ваш адрес");
      } else {
        toast.error("Неверный email или пароль");
      }
      return;
    }
    leave();
    router.push("/");
    router.refresh();
  }

  const locked = busy || googleBusy;

  return (
    <AuthCard title="Вход" subtitle="Войдите в свой аккаунт moneta">
      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        socialOptions={{ errorCallbackURL: "/login" }}
        onBusyChange={setGoogleBusy}
        disabled={busy}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3.5"
        noValidate
      >
        <TextField
          label="Email"
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
          disabled={locked}
        />

        <TextField
          label="Пароль"
          id="password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
          disabled={locked}
        />

        <div className="-mt-1.5 -mb-1.5 text-right">
          <AuthLink
            href="/forgot-password"
            disabled={locked}
            className="inline-flex min-h-11 items-center text-sm"
          >
            Забыли пароль?
          </AuthLink>
        </div>

        <Button type="submit" loading={busy} disabled={googleBusy}>
          Войти
        </Button>
      </form>

      <p className="text-center text-[15px] text-ink-2">
        Нет аккаунта?{" "}
        <AuthLink href="/sign-up" disabled={locked}>
          Создать аккаунт
        </AuthLink>
      </p>
    </AuthCard>
  );
}
