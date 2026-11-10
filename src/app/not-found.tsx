import { SearchX } from "lucide-react";
import { getSession } from "@/lib/dal";
import { AppScreen } from "@/components/layout/app-screen";
import { StatusCard } from "@/components/ui/status-card";

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
      <title>Страница не найдена — moneta</title>
      {session ? (
        <AppScreen tab="none">
          <div className="px-4">{card}</div>
        </AppScreen>
      ) : (
        <div className="flex-1 bg-page">
          <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 px-4 pt-5 pb-8 text-ink">
            <span className="px-1 text-[22px] leading-[normal] font-bold tracking-[-0.03em]">
              moneta
            </span>
            {card}
          </main>
        </div>
      )}
    </>
  );
}
