/**
 * Next.js instrumentation hook. `register()` runs once when a server instance
 * starts, before it serves any request. We force strict env validation here so a
 * misconfigured deployment fails fast at boot instead of on the first request.
 *
 * `register` is invoked in all runtimes (Node + Edge), so we gate on NEXT_RUNTIME.
 * It does NOT run during `next build` — that's why CI/Docker still set
 * SKIP_ENV_VALIDATION to skip the import-time check in src/env.ts during the build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Side-effect import: loading the module triggers loadEnv() and throws on
    // invalid config. This is the pattern Next.js docs recommend for register().
    await import("./env");
  }
}
