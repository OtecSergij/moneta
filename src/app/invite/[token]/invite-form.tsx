"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { rateLimitProbe } from "@/lib/auth-rate-limit";
import { USER_NAME_MAX, signUpSchema } from "@/lib/auth-schemas";
import { useLeaving } from "@/lib/hooks/use-leaving";
import { AvatarInitial } from "@/components/kit/avatar-initial";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { GoogleSignIn, useGoogleErrorToast } from "@/components/google-sign-in";
import { AuthCard } from "@/components/ui/auth-card";
import { StatusCard } from "@/components/ui/status-card";

const inviteSignUpSchema = signUpSchema.pick({ email: true, password: true });
type InviteSignUpValues = { email: string; password: string };

const INVITE_INVALID = "INVITE_INVALID";

export function InviteForm({
  token,
  ownerName,
  hasGoogle,
  googleError,
}: {
  token: string;
  ownerName: string;
  hasGoogle: boolean;
  googleError?: string;
}) {
  const router = useRouter();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignUpValues>({
    resolver: zodResolver(inviteSignUpSchema),
  });
  const { busy, leave } = useLeaving(isSubmitting);
  useGoogleErrorToast(googleError);

  async function onSubmit(values: InviteSignUpValues) {
    // Better Auth's client types omit unknown fields, but it forwards every
    // key to the request body, where inviteGuard reads inviteToken.
    const payload = {
      email: values.email,
      password: values.password,
      name: values.email.split("@")[0].slice(0, USER_NAME_MAX),
      inviteToken: token,
      callbackURL: "/",
    };
    const limit = rateLimitProbe();
    const { error } = await authClient.signUp.email(payload, limit.fetchOptions);
    if (error) {
      if (error.code === INVITE_INVALID) {
        leave();
        router.refresh();
        return;
      }
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

  return (
    <AuthCard
      title={`${ownerName} приглашает вас вести траты вместе`}
      leading={<AvatarInitial name={ownerName} toneIndex={0} size="lg" />}
    >
      <GoogleSignIn
        hasGoogle={hasGoogle}
        label="Продолжить с Google"
        socialOptions={{
          errorCallbackURL: `/invite/${token}`,
          additionalData: { inviteToken: token },
        }}
        onBusyChange={setGoogleBusy}
        onError={(error) => {
          if (error.code !== INVITE_INVALID) return false;
          router.refresh();
          return true;
        }}
        disabled={busy}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3.5"
        noValidate
      >
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
          disabled={busy || googleBusy}
        />
        <TextField
          label="Пароль"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
          disabled={busy || googleBusy}
        />
        <Button
          type="submit"
          loading={busy}
          disabled={googleBusy}
          className="mt-1.5"
        >
          Зарегистрироваться
        </Button>
      </form>
    </AuthCard>
  );
}
