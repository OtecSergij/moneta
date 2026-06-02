import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };

// Two projects:
//   unit        — *.test.ts, no DB, instant.
//   integration — *.itest.ts, spins up a throwaway Postgres via Testcontainers
//                 in globalSetup (src/test/global-setup.ts), so no manually
//                 running Postgres is needed.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["**/*.itest.ts", "node_modules", ".next", "dist"],
          env: { NODE_ENV: "test" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.itest.ts"],
          exclude: ["node_modules", ".next", "dist"],
          globalSetup: ["./src/test/global-setup.ts"],
          // One container shared across all integration files; run sequentially
          // so they don't race on the same database.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          env: {
            // DATABASE_URL is injected by globalSetup (the container's URL).
            NODE_ENV: "test",
            // env.ts requires these even when no auth flow is exercised — give
            // it valid dummy values so zod-validation passes.
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-test",
            BETTER_AUTH_URL: "http://localhost:3000",
          },
        },
      },
    ],
  },
});
