import { LogoutButton } from "@/components/logout-button";

// Temporary placeholder. The real home screen (weekly summary + quick-add) is
// a separate task — see docs/business-spec.md §5.1.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold text-text">moneta</h1>
      <p className="max-w-xs text-sm text-text-muted">
        Скоро здесь появится сводка ваших расходов.
      </p>
      <LogoutButton />
    </main>
  );
}
