"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal";
import { SalaryDaysInput, setSalaryDays } from "@/repositories/user-settings";
import type { ActionResult } from "./types";

// Like every action: reachable via direct POST, so verify auth and re-validate
// input server-side. Never trust the client.
export async function updateSalaryDaysAction(
  input: unknown,
): Promise<ActionResult<number[]>> {
  const { user } = await requireSession();
  const parsed = SalaryDaysInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте выбранные дни" };

  const salaryDays = await setSalaryDays(user.id, parsed.data);
  // History shows the "с последней зарплаты" preset only when salary days exist.
  revalidatePath("/history");
  return { ok: true, data: salaryDays };
}
