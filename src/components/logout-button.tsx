"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { MenuItem } from "@/components/kit/sheet-menu";

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
    <MenuItem
      Icon={LogOut}
      tone="danger"
      tile={false}
      loading={loading}
      onClick={onLogout}
    >
      Выйти
    </MenuItem>
  );
}
