// Liveness probe for the Docker HEALTHCHECK. Coolify gates rolling updates on
// container health, so a passing check lets the new container come up before the
// old one is torn down. Returns 200 as soon as the Next.js server is serving
// HTTP — intentionally no DB/auth check, so a transient DB blip can't mark the
// app unhealthy mid-deploy (migrations already ran at startup before boot).
export function GET() {
  return new Response("ok", { status: 200 });
}
