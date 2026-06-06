# syntax=docker/dockerfile:1.7

# Node 22 LTS. Next.js 16 requires Node >= 20.9. Debian "-slim" (glibc), not
# alpine/musl, because next/image needs the native `sharp` module (musl is the
# classic source of next/image breakage). The official vercel/next.js Docker
# example uses Debian slim for the same reason.
ARG NODE_VERSION=22-slim

# ---------- deps: install node_modules (kept in its own layer for caching) ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- builder: produce the standalone Next.js server ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Runtime env (DATABASE_URL, BETTER_AUTH_*, RESEND_*, ...) is NOT needed to build.
# Skip the import-time validation in src/env.ts; the real check runs at server
# startup via src/instrumentation.ts. No secrets are baked into the image.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=1
# Persist the Next build cache across builds (not copied into the runner image).
RUN --mount=type=cache,target=/app/.next/cache npm run build
# Bundle the standalone DB migration runner into a self-contained CommonJS file.
# Needed because drizzle-orm/postgres are bundled into Next's server chunks (not
# exposed in standalone/node_modules), so a plain script couldn't resolve them.
RUN npx esbuild src/db/migrate.ts --bundle --platform=node --format=cjs --outfile=migrate.cjs

# ---------- runner: minimal runtime image ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Run as the image's built-in non-root `node` user (uid 1000).
USER node
# public/ and .next/static are NOT included in standalone output — copy manually.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Migration runner + SQL files, applied at startup before the server boots.
COPY --from=builder --chown=node:node /app/migrate.cjs ./migrate.cjs
COPY --from=builder --chown=node:node /app/src/db/migrations ./src/db/migrations
EXPOSE 3000
# Apply DB migrations, then exec the standalone server (so it becomes PID 1 and
# receives signals). Fail-fast: if migrations fail, the server never starts and
# the deploy is marked failed.
CMD ["sh", "-c", "node migrate.cjs && exec node server.js"]
