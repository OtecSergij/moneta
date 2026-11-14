import type { SpaceId } from "@/lib/space-id";

// Stands in for @/lib/dal in action tests:
//   vi.mock("@/lib/dal", () => import("@/test/session-mock"));
// `session.current = null` signs the caller out; `session.now` sets the
// caller's clock (null: the server's).
export const session = {
  current: null as { userId: string; spaceId: SpaceId } | null,
  now: null as Date | null,
};

export async function userNow(): Promise<Date> {
  return session.now ?? new Date();
}

export async function requireSpace() {
  if (session.current === null) throw new Error("NEXT_REDIRECT;/login");
  return {
    user: { id: session.current.userId },
    spaceId: session.current.spaceId,
    role: "owner",
  };
}
