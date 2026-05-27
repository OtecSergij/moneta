import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Catch-all route delegating every /api/auth/* request to Better Auth's
// internal handler. BA's default basePath is /api/auth, matching this folder.

export const { GET, POST } = toNextJsHandler(auth);
