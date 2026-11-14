"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { rateLimitProbe } from "@/lib/auth-rate-limit";
import {
  USER_NAME_MAX,
  isBlankName,
  signUpSchema,
  type SignUpValues,
} from "@/lib/auth-schemas";
import { AuthCard } from "@/components/ui/auth-card";
import { AuthLink } from "@/components/ui/auth-link";
import { StatusCard } from "@/components/ui/status-card";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { GoogleSignIn, useGoogleErrorToast } from "@/components/google-sign-in";

export function SignUpForm({
  hasGoogle,
  googleError,
}: {
  hasGoogle: boolean;
  googleError?: string;
}) {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });
  useGoogleErrorToast(googleError);

  async function onSubmit(values: SignUpValues) {
    const name =
      values.name && !isBlankName(values.name)
        ? values.name
        : values.email.split("@")[0].slice(0, USER_NAME_MAX);
    const limit = rateLimitProbe();
    const { error } = await authClient.signUp.email(
      { email: values.email, password: values.password, name },
      limit.fetchOptions,
    );
    if (error) {
      const tooMany = limit.message(error.status);
      if (tooMany) {
        toast.error(tooMany);
        return;
      }
      toast.error("Не удалось создать аккаунт", {
        description:
          "Если у вас уже есть аккаунт, попробуйте войти или восстановить пароль.",
      });
      return;
    }
    setSubmittedEmail(values.email);
  }

  if (submittedEmail) {
    return (
      <StatusCard
        icon={MailCheck}
        title="Проверьте почту"
        action={{ href: "/login", label: "Вернуться ко входу" }}
      >
        Мы отправили ссылку подтверждения на{" "}
        <span className="font-medium text-ink">{submittedEmail}</span>.
        Откройте письмо и нажмите на ссылку, чтобы войти.
      </StatusCard>
    );
  }

  const locked = isSubmitting || googleBusy;

  return (
    <AuthCard title="Создать аккаунт" subtitle="Начните вести расходы в moneta">
      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        socialOptions={{ errorCallbackURL: "/sign-up" }}
        onBusyChange={setGoogleBusy}
        disabled={isSubmitting}
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
          label="Имя (необязательно)"
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Как к вам обращаться"
          error={errors.name?.message}
          {...register("name")}
          disabled={locked}
        />

        <TextField
          label="Пароль"
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
          disabled={locked}
        />

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={googleBusy}
          className="mt-1.5"
        >
          Зарегистрироваться
        </Button>
      </form>

      <p className="text-center text-[15px] text-ink-2">
        Уже есть аккаунт?{" "}
        <AuthLink href="/login" disabled={locked}>
          Войти
        </AuthLink>
      </p>
    </AuthCard>
  );
}
