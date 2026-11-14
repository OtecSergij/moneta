import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getSession } from "@/lib/dal";
import { AppScreen } from "@/components/layout/app-screen";
import { AuthShell } from "@/components/layout/auth-shell";
import { StatusCard } from "@/components/ui/status-card";

const TITLE = "Страница не найдена — moneta";

export const metadata: Metadata = { title: TITLE };

export default async function NotFound() {
  const session = await getSession();
  const card = (
    <StatusCard
      icon={SearchX}
      tone="warn"
      title="Страница не найдена"
      action={
        session
          ? { href: "/", label: "На главную" }
          : { href: "/login", label: "Войти в moneta" }
      }
    >
      Возможно, ссылка устарела или у вас нет к ней доступа.
    </StatusCard>
  );

  return (
    <>
      {/* A page's own metadata (lists/[id]) outranks the export above when
          the page calls notFound(); this hoisted title still comes first. */}
      <title>{TITLE}</title>
      {session ? (
        <AppScreen tab="none">
          <div className="px-4">{card}</div>
        </AppScreen>
      ) : (
        <AuthShell>{card}</AuthShell>
      )}
    </>
  );
}
