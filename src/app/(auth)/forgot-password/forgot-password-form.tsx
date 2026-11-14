"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/auth-schemas";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/ui/auth-card";
import { AuthLink } from "@/components/ui/auth-link";
import { StatusCard } from "@/components/ui/status-card";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordValues) {
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });

    setSent(true);
  }

  if (sent) {
    return (
      <StatusCard
        icon={MailCheck}
        title="Проверьте почту"
        action={{ href: "/login", label: "Вернуться ко входу" }}
      >
        Мы отправили ссылку для сброса пароля.
      </StatusCard>
    );
  }

  return (
    <AuthCard title="Восстановление пароля" subtitle="Введите email.">
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
          disabled={isSubmitting}
        />

        <Button type="submit" loading={isSubmitting} className="mt-1.5">
          Отправить ссылку
        </Button>
      </form>

      <p className="text-center text-[15px]">
        <AuthLink href="/login" disabled={isSubmitting}>
          Вернуться ко входу
        </AuthLink>
      </p>
    </AuthCard>
  );
}
