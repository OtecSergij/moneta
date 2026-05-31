"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={onLogout} loading={loading}>
      {loading ? null : <LogOut className="size-4" />}
      Выйти
    </Button>
  );
}
