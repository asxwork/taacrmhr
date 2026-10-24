// `npm run build` entry point.
// Hostinger's build command is fixed to `npm run build`, so when DATABASE_URL points at
// MySQL this also switches the schema, creates/updates tables and seeds configuration.
// Locally (SQLite) it is a plain `next build`.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const url = process.env.DATABASE_URL ?? "";

if (url.startsWith("mysql://")) {
  console.log("MySQL DATABASE_URL detected: running production database setup");
  run("node scripts/use-mysql.mjs");
  run("npx prisma generate");
  run("npx prisma db push --skip-generate");
  run("npx tsx prisma/seed.ts");
  run("npx next build");
} else {
  if (process.env.NODE_ENV === "production" || process.env.CI) {
    console.warn("WARNING: DATABASE_URL is not a mysql:// URL; building without database setup");
  }
  run("npx next build --turbopack");
}
