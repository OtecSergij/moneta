import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { redirect } from "next/navigation";
import { toast } from "sonner";
import { runAction } from "./use-action-runner";

const onNotFound = vi.fn();
const onSuccess = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAction", () => {
  it("reports success and stays", async () => {
    expect(await runAction(async () => ({ ok: true, data: 1 }), "Сбой", { onNotFound })).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it("hands the data to onSuccess after the success text", async () => {
    const order: string[] = [];
    vi.mocked(toast.success).mockImplementationOnce(() => {
      order.push("toast");
      return 0;
    });
    onSuccess.mockImplementationOnce(() => order.push("onSuccess"));
    const call = async () => ({ ok: true, data: { id: "a1" } }) as const;
    expect(await runAction(call, "Сбой", { success: "Готово", onSuccess })).toBe(true);
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: "a1" });
    expect(order).toEqual(["toast", "onSuccess"]);
  });

  it("shows a refusal and stays", async () => {
    const call = async () => ({ ok: false, error: "Пополнение не найдено" }) as const;
    expect(await runAction(call, "Сбой", { onNotFound, onSuccess })).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Пополнение не найдено");
    expect(onNotFound).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a refusal and leaves when the object is gone", async () => {
    const call = async () => ({ ok: false, error: "Счёт не найден", notFound: true }) as const;
    expect(await runAction(call, "Сбой", { onNotFound })).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Счёт не найден");
    expect(onNotFound).toHaveBeenCalledOnce();
  });

  it("shows the refusal of a gone object when nobody listens for it", async () => {
    const call = async () => ({ ok: false, error: "Список не найден", notFound: true }) as const;
    expect(await runAction(call, "Сбой")).toBe(false);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Список не найден");
  });

  it("shows the fallback text when the action throws", async () => {
    const call = async () => {
      throw new Error("network");
    };
    expect(await runAction(call, "Сбой", { onNotFound, onSuccess })).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Сбой");
    expect(onNotFound).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows the success text only on success", async () => {
    expect(
      await runAction(async () => ({ ok: true, data: 1 }), "Сбой", { onNotFound, success: "Готово" }),
    ).toBe(true);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Готово");
    vi.clearAllMocks();

    await runAction(async () => ({ ok: true, data: 1 }), "Сбой", { onNotFound });
    await runAction(async () => ({ ok: false, error: "Нет" }) as const, "Сбой", {
      onNotFound,
      success: "Готово",
    });
    await runAction(
      async () => {
        throw new Error("network");
      },
      "Сбой",
      { onNotFound, success: "Готово" },
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("lets a Next redirect through", async () => {
    const call = async () => redirect("/login");
    await expect(runAction(call, "Сбой", { onNotFound })).rejects.toThrow("NEXT_REDIRECT");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
