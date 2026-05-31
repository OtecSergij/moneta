"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/auth-schemas";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";

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
    // redirectTo is where BA sends the user from the email link, with ?token=
    // appended after server-side validation.
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });
    // Always show the same confirmation — never reveal whether the email is
    // registered. BA enforces this server-side too; the UI never branches.
    setSent(true);
  }

  if (sent) {
    return (
      <StatusCard icon={MailCheck} title="Проверьте почту">
        Мы отправили ссылку для сброса пароля.
        <p className="mt-6">
          <Link href="/login" className="text-accent hover:text-accent-hover">
            Вернуться ко входу
          </Link>
        </p>
      </StatusCard>
    );
  }

  return (
    <AuthCard title="Восстановление пароля" subtitle="Введите email.">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-4"
        noValidate
      >
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <TextInput
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Отправить ссылку
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link href="/login" className="text-accent hover:text-accent-hover">
          Вернуться ко входу
        </Link>
      </p>
    </AuthCard>
  );
}
