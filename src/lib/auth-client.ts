import { createAuthClient } from "better-auth/react";

// baseURL defaults to the current origin in the browser — that's what we
// want. For Server Components, import `auth` from "@/lib/auth" directly and
// call `auth.api.getSession({ headers: await headers() })`.

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
