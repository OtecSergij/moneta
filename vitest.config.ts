import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    passWithNoTests: true,
    globalSetup: ["./src/test/global-setup.ts"],
    // Tests share the `moneta_test` database. Run sequentially to avoid
    // races between files (within a file vitest is already sequential).
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      // Override .env.local for tests — point at the test database.
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/moneta_test",
      NODE_ENV: "test",
      // env.ts requires these even if no auth flow is exercised in repo
      // tests — give it valid dummy values so zod-validation passes.
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-test",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
