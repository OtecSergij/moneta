import { plural } from "@/lib/plural";

const MINUTE_FORMS = ["минуту", "минуты", "минут"] as const;

export function tooManyAttemptsMessage(
  status: number,
  retryAfter: string | null,
): string | null {
  if (status !== 429) return null;
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return "Слишком много попыток. Попробуйте позже";
  }
  const minutes = Math.ceil(seconds / 60);
  return `Слишком много попыток. Попробуйте через ${minutes} ${plural(minutes, MINUTE_FORMS)}`;
}

// Better Auth sends the seconds left in X-Retry-After, which its error object drops.
export function rateLimitProbe() {
  let retryAfter: string | null = null;
  return {
    fetchOptions: {
      onError: ({ response }: { response: Response }) => {
        retryAfter = response.headers.get("X-Retry-After");
      },
    },
    message: (status: number) => tooManyAttemptsMessage(status, retryAfter),
  };
}
