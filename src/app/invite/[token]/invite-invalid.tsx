import { Link2Off } from "lucide-react";
import { StatusCard } from "@/components/ui/status-card";

export function InviteInvalid() {
  return (
    <StatusCard
      as="main"
      icon={Link2Off}
      tone="warn"
      title="Ссылка больше не работает"
      action={{ href: "/login", label: "Войти в moneta" }}
    >
      Её уже использовали или заменили новой. Попросите прислать свежую ссылку.
    </StatusCard>
  );
}
