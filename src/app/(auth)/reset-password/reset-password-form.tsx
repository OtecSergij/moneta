"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/auth-schemas";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({
  token,
  invalid,
}: {
  token?: string;
  invalid: boolean;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) return;
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (error) {
      toast.error("Ссылка истекла или недействительна. Запросите новую");
      return;
    }
    // revokeSessionsOnPasswordReset is on → all sessions cleared, log in fresh.
    toast.success("Пароль обновлён. Войдите снова");
    router.push("/login");
  }

  if (invalid) {
    return (
      <StatusCard
        icon={TriangleAlert}
        tone="danger"
        title="Ссылка недействительна"
      >
        Ссылка для сброса пароля истекла или некорректна. Запросите новую.
        <p className="mt-6">
          <Link
            href="/forgot-password"
            className="text-accent hover:text-accent-hover"
          >
            Запросить новую ссылку
          </Link>
        </p>
      </StatusCard>
    );
  }

  return (
    <AuthCard title="Новый пароль" subtitle="Придумайте новый пароль для входа.">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 flex flex-col gap-4"
        noValidate
      >
        <Field
          label="Новый пароль"
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

        <Field
          label="Повторите пароль"
          htmlFor="confirm"
          error={errors.confirm?.message}
        >
          <TextInput
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...register("confirm")}
          />
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Сбросить пароль
        </Button>
      </form>
    </AuthCard>
  );
}
