"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginValues } from "@/lib/auth-schemas";
import { AuthCard } from "@/components/ui/auth-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { GoogleSignIn } from "@/components/google-sign-in";

export function LoginForm({ hasGoogle }: { hasGoogle: boolean }) {
  const router = useRouter();
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      // EMAIL_NOT_VERIFIED is safe to surface (user proved they know the
      // password); everything else stays generic to avoid enumeration.
      if (error.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Подтвердите email — мы отправили ссылку на ваш адрес");
      } else {
        toast.error("Неверный email или пароль");
      }
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthCard title="Вход" subtitle="Войдите в свой аккаунт moneta">
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
          label="Пароль"
          htmlFor="password"
          error={errors.password?.message}
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-hover"
          >
            Забыли пароль?
          </Link>
        </div>

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={googleBusy}
          className="w-full"
        >
          Войти
        </Button>
      </form>

      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        disabled={isSubmitting}
        onBusyChange={setGoogleBusy}
      />

      <p className="mt-6 text-center text-sm text-text-muted">
        Нет аккаунта?{" "}
        <Link href="/sign-up" className="text-accent hover:text-accent-hover">
          Создать аккаунт
        </Link>
      </p>
    </AuthCard>
  );
}
