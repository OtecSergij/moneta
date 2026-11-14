import { beforeEach, describe, expect, it, vi } from "vitest";

// A model of React's async transitions: isPending holds until the action and
// every transition started while it runs (a router navigation) have finished.
const react = vi.hoisted(() => {
  const state = { pending: false, scope: null as Promise<unknown>[] | null };
  function startTransition(callback: () => unknown) {
    const work = Promise.resolve(callback());
    if (state.scope) {
      state.scope.push(work);
      return;
    }
    const scope = [work];
    state.scope = scope;
    state.pending = true;
    void (async () => {
      for (let i = 0; i < scope.length; i++) await scope[i].catch(() => {});
      state.scope = null;
      state.pending = false;
    })();
  }
  return { state, startTransition };
});

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useTransition: () => [react.state.pending, react.startTransition],
  useRef: <T>(current: T) => ({ current }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { useActionRunner } from "./use-action-runner";
import { useSheetTask } from "./use-sheet-task";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let leavePage: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  react.state.pending = false;
  react.state.scope = null;
  const navigation = new Promise<void>((resolve) => (leavePage = resolve));
  router.replace.mockImplementation(() => react.startTransition(() => navigation));
});

describe("useSheetTask with useActionRunner", () => {
  it("a not-found answer keeps the window pending until the page changes", async () => {
    const onClose = vi.fn();
    const { run } = useSheetTask(onClose);
    const runner = useActionRunner("/accounts");

    await run(() =>
      runner(async () => ({ ok: false, error: "Счёт не найден", notFound: true }) as const, "Сбой"),
    );
    await flush();

    expect(toast.error).toHaveBeenCalledWith("Счёт не найден");
    expect(router.replace).toHaveBeenCalledWith("/accounts");
    expect(react.state.pending).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    leavePage();
    await flush();
    expect(react.state.pending).toBe(false);
  });

  it("a refusal that stays on the page unlocks once the answer is in", async () => {
    const onClose = vi.fn();
    const { run } = useSheetTask(onClose);
    const runner = useActionRunner("/accounts");

    await run(() =>
      runner(async () => ({ ok: false, error: "Перевод не найден" }) as const, "Сбой"),
    );
    await flush();

    expect(router.replace).not.toHaveBeenCalled();
    expect(react.state.pending).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("success closes the window", async () => {
    const onClose = vi.fn();
    const { run } = useSheetTask(onClose);
    const runner = useActionRunner("/accounts");

    await run(() => runner(async () => ({ ok: true, data: null }) as const, "Сбой", "Готово"));
    await flush();

    expect(onClose).toHaveBeenCalledOnce();
    expect(react.state.pending).toBe(false);
  });

  it("ignores a second run while the first is going", async () => {
    const { run } = useSheetTask();
    let finish!: (ok: boolean) => void;
    const first = run(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const second = vi.fn(async () => true);

    await run(second);
    expect(second).not.toHaveBeenCalled();

    finish(false);
    await first;
  });
});
