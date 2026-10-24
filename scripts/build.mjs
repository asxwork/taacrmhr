// `npm run build`. Hosting panels (e.g. Hostinger) often lock the build command, so the production
// database setup lives here: when DATABASE_URL points at MySQL, switch the Prisma schema to MySQL,
// generate the client, create/update tables and seed configuration — then build Next.js.
// Locally (SQLite) it just builds.
import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

const url = process.env.DATABASE_URL ?? "";
if (url.startsWith("mysql://")) {
  run("node scripts/use-mysql.mjs");
  run("npx prisma generate");
  run("npx prisma db push --skip-generate");
  run("npx tsx prisma/seed.ts");
} else if (process.env.NODE_ENV === "production" || process.env.CI) {
  console.warn("\n⚠  DATABASE_URL is not a MySQL URL — building against SQLite. Set DATABASE_URL in the hosting panel's environment variables.\n");
}

run("npx next build --turbopack");
