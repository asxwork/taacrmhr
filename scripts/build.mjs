// `npm run build` entry point.
// Hostinger's build command is fixed to `npm run build`, so when DATABASE_URL points at
// MySQL this also switches the schema, creates/updates tables and seeds configuration.
// Locally (SQLite) it is a plain `next build`. Turbopack is kept for `dev` only: its build
// spawns PostCSS worker processes that Hostinger's build sandbox kills.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const url = process.env.DATABASE_URL ?? "";

if (url.startsWith("mysql://")) {
  console.log("MySQL DATABASE_URL detected: running production database setup");
  logConnection(url);
  run("node scripts/use-mysql.mjs");
  run("npx prisma generate");
  run("npx prisma db push --skip-generate");
  run("npx tsx prisma/seed.ts");
  run("npx next build");
} else {
  if (process.env.NODE_ENV === "production" || process.env.CI) {
    console.warn("WARNING: DATABASE_URL is not a mysql:// URL; building without database setup");
  }
  run("npx next build");
}

// Prints what Prisma will connect with (never the password) so a P1000 "authentication failed"
// can be checked against hPanel → Databases → MySQL Databases.
function logConnection(raw) {
  const auth = raw.slice("mysql://".length).split("/")[0];
  if ((auth.match(/@/g) || []).length > 1 || /[#?]/.test(auth)) {
    console.warn("WARNING: DATABASE_URL password contains unencoded @ # or ? — use letters and numbers only, or URL-encode it");
  }
  try {
    const u = new URL(raw);
    const pass = decodeURIComponent(u.password);
    console.log(`  user:     ${decodeURIComponent(u.username)}`);
    console.log(`  host:     ${u.hostname}:${u.port || 3306}`);
    console.log(`  database: ${u.pathname.slice(1)}`);
    console.log(`  password: ${pass.length} characters${/\s/.test(pass) ? " (contains spaces!)" : ""}`);
  } catch {
    console.warn("WARNING: DATABASE_URL is not a valid URL");
  }
}
