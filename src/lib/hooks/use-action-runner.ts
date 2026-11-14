"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResultWithNotFound } from "@/lib/actions/types";

export async function runAction<T>(
  call: () => Promise<ActionResultWithNotFound<T>>,
  failure: string,
  {
    success,
    onSuccess,
    onNotFound,
  }: {
    success?: string;
    onSuccess?: (data: T) => void;
    onNotFound?: () => void;
  } = {},
): Promise<boolean> {
  let res;
  try {
    res = await call();
  } catch (error) {
    unstable_rethrow(error);
    toast.error(failure);
    return false;
  }
  if (!res.ok) {
    toast.error(res.error);
    if ("notFound" in res) onNotFound?.();
    return false;
  }
  if (success) toast.success(success);
  onSuccess?.(res.data);
  return true;
}

export function useActionRunner(parentHref: string) {
  const router = useRouter();
  return (
    call: () => Promise<ActionResultWithNotFound<unknown>>,
    failure: string,
    success?: string,
  ) =>
    runAction(call, failure, {
      success,
      onNotFound: () => router.replace(parentHref),
    });
}
