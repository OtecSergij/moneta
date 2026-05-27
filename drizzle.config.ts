import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js .env precedence: .env.local overrides .env.
loadEnv({ path: ".env.local" });
loadEnv(); // fallback to .env

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit (set in .env.local or shell)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
