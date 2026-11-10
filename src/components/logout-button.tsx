"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    const failed = await authClient.signOut().then(
      (res) => Boolean(res.error),
      () => true,
    );
    if (failed) {
      toast.error("Не удалось выйти");
      setLoading(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      aria-busy={loading || undefined}
      className="flex min-h-14 w-full cursor-pointer items-center gap-2.5 border-t border-row-line bg-transparent px-4 text-left text-base font-medium text-danger-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="size-5 animate-spin" strokeWidth={1.75} aria-hidden />
      ) : (
        <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
      )}
      Выйти
    </button>
  );
}
