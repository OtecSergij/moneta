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
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
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
          label="Пароль"
          id="password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />

        <div className="-mt-1.5 -mb-1.5 text-right">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-ink hover:text-primary"
          >
            Забыли пароль?
          </Link>
        </div>

        <Button type="submit" loading={isSubmitting} disabled={googleBusy}>
          Войти
        </Button>
      </form>

      <p className="text-center text-[15px] text-ink-2">
        Нет аккаунта?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary-ink hover:text-primary"
        >
          Создать аккаунт
        </Link>
      </p>
    </AuthCard>
  );
}
