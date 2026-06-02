"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { signUpSchema, type SignUpValues } from "@/lib/auth-schemas";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
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
    const name = values.name || values.email.split("@")[0];
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
      <StatusCard icon={MailCheck} title="Проверьте почту">
        Мы отправили ссылку подтверждения на{" "}
        <span className="font-medium text-text">{submittedEmail}</span>.
        Откройте письмо и нажмите на ссылку, чтобы войти.
        <p className="mt-6">
          <Link href="/login" className="text-accent hover:text-accent-hover">
            Вернуться ко входу
          </Link>
        </p>
      </StatusCard>
    );
  }

  return (
    <AuthCard title="Создать аккаунт" subtitle="Начните вести расходы в moneta">
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

        <Field
          label="Имя (необязательно)"
          htmlFor="name"
          error={errors.name?.message}
        >
          <TextInput
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Как к вам обращаться"
            {...register("name")}
          />
        </Field>

        <Field
          label="Пароль"
          htmlFor="password"
          error={errors.password?.message}
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={googleBusy}
          className="w-full"
        >
          Зарегистрироваться
        </Button>
      </form>

      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        disabled={isSubmitting}
        onBusyChange={setGoogleBusy}
      />

      <p className="mt-6 text-center text-sm text-text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-accent hover:text-accent-hover">
          Войти
        </Link>
      </p>
    </AuthCard>
  );
}
