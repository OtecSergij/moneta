"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { signUpSchema } from "@/lib/auth-schemas";
import { AvatarInitial } from "@/components/kit/avatar-initial";
import { Button } from "@/components/kit/button";
import { GoogleContinueButton } from "@/components/kit/google-continue-button";
import { TextField } from "@/components/kit/text-field";
import { StatusCard } from "@/components/ui/status-card";

const inviteSignUpSchema = signUpSchema.pick({ email: true, password: true });
type InviteSignUpValues = { email: string; password: string };

const INVITE_INVALID = "INVITE_INVALID";

export function InviteForm({
  token,
  ownerName,
  hasGoogle,
  error,
}: {
  token: string;
  ownerName: string;
  hasGoogle: boolean;
  error: boolean;
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

  useEffect(() => {
    if (!error) return;
    // The Toaster subscribes in its own effect, which runs after this one on
    // first mount; a toast published earlier is dropped.
    const timer = setTimeout(() =>
      toast.error("Не удалось войти через Google", {
        id: "invite-google-error",
      }),
    );
    return () => clearTimeout(timer);
  }, [error]);

  async function onSubmit(values: InviteSignUpValues) {
    // Better Auth's client types omit unknown fields, but it forwards every
    // key to the request body, where inviteGuard reads inviteToken.
    const payload = {
      email: values.email,
      password: values.password,
      name: values.email.split("@")[0],
      inviteToken: token,
      callbackURL: "/",
    };
    const { error } = await authClient.signUp.email(payload);
    if (error) {
      if (error.code === INVITE_INVALID) {
        router.refresh();
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

  async function onGoogle() {
    setGoogleBusy(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: `/invite/${token}`,
      additionalData: { inviteToken: token },
    });
    if (error) {
      setGoogleBusy(false);
      if (error.code === INVITE_INVALID) {
        router.refresh();
        return;
      }
      toast.error("Не удалось войти через Google");
    }
  }

  if (submittedEmail) {
    return (
      <StatusCard
        as="main"
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
    <main className="flex flex-col gap-5 rounded-sheet bg-card px-5 py-6">
      <div className="flex flex-col gap-3">
        <AvatarInitial name={ownerName} toneIndex={0} size="lg" />
        <h1 className="text-2xl leading-[30px] font-bold tracking-[-0.02em]">
          {ownerName} приглашает вас вести траты вместе
        </h1>
      </div>

      {hasGoogle ? (
        <>
          <GoogleContinueButton
            onClick={onGoogle}
            loading={googleBusy}
            disabled={isSubmitting}
          />
          <div
            aria-hidden
            className="flex items-center gap-3 text-[13px] text-ink-3"
          >
            <span className="h-px flex-1 bg-line" />
            или
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

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
        />
        <TextField
          label="Пароль"
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
    </main>
  );
}
