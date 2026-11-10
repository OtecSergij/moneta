"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  USER_NAME_MAX,
  signUpSchema,
  type SignUpValues,
} from "@/lib/auth-schemas";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { GoogleSignIn } from "@/components/google-sign-in";

export function SignUpForm({ hasGoogle }: { hasGoogle: boolean }) {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit(values: SignUpValues) {
    const name =
      values.name || values.email.split("@")[0].slice(0, USER_NAME_MAX);
    const { error } = await authClient.signUp.email({
      email: values.email,
      password: values.password,
      name,
    });
    if (error) {
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

  return (
    <AuthCard title="Создать аккаунт" subtitle="Начните вести расходы в moneta">
      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        disabled={isSubmitting}
        onBusyChange={setGoogleBusy}
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
        />

        <TextField
          label="Имя (необязательно)"
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Как к вам обращаться"
          error={errors.name?.message}
          {...register("name")}
        />

        <TextField
          label="Пароль"
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
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
        <Link
          href="/login"
          className="font-medium text-primary-ink hover:text-primary"
        >
          Войти
        </Link>
      </p>
    </AuthCard>
  );
}
