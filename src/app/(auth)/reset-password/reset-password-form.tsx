"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/auth-schemas";
import { authClient } from "@/lib/auth-client";
import { useLeaving } from "@/lib/hooks/use-leaving";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";

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
  const { busy, leave } = useLeaving(isSubmitting);
  const [tokenRejected, setTokenRejected] = useState(false);

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) return;
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (error?.code === "INVALID_TOKEN") {
      setTokenRejected(true);
      return;
    }
    if (error) {
      toast.error("Ссылка истекла или недействительна. Запросите новую");
      return;
    }
    // revokeSessionsOnPasswordReset is on → all sessions cleared, log in fresh.
    toast.success("Пароль обновлён. Войдите снова");
    leave();
    router.push("/login");
  }

  if (invalid || tokenRejected) {
    return (
      <StatusCard
        icon={TriangleAlert}
        tone="danger"
        title="Ссылка недействительна"
        action={{ href: "/forgot-password", label: "Запросить новую ссылку" }}
      >
        Ссылка для сброса пароля истекла или некорректна. Запросите новую.
      </StatusCard>
    );
  }

  return (
    <AuthCard title="Новый пароль" subtitle="Придумайте новый пароль для входа.">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3.5"
        noValidate
      >
        <TextField
          label="Новый пароль"
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
          disabled={busy}
        />

        <TextField
          label="Повторите пароль"
          id="confirm"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
          disabled={busy}
        />

        <Button type="submit" loading={busy} className="mt-1.5">
          Сбросить пароль
        </Button>
      </form>
    </AuthCard>
  );
}
