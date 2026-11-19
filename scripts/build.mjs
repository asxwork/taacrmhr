// `npm run build` entry point.
// Hostinger's build command is fixed to `npm run build`, so when DATABASE_URL points at
// MySQL this also switches the schema, creates/updates tables and seeds configuration.
// Locally (SQLite) it is a plain `next build`. Turbopack is kept for `dev` only: its build
// spawns PostCSS worker processes that Hostinger's build sandbox kills.
import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const url = process.env.DATABASE_URL ?? "";

if (url.startsWith("mysql://")) {
  console.log("MySQL DATABASE_URL detected: running production database setup");
  logConnection(url);
  makeRunnable();
  run("node scripts/use-mysql.mjs");
  run("npx prisma generate");
  dbPush();
  run("npx tsx prisma/seed.ts");
  run("npx next build");
} else {
  if (process.env.NODE_ENV === "production" || process.env.CI) {
    console.warn("WARNING: DATABASE_URL is not a mysql:// URL; building without database setup");
  }
  run("npx next build");
}

// The seed step (tsx) runs esbuild's program from node_modules: make sure it may run too.
function makeRunnable() {
  const root = path.join("node_modules", "@esbuild");
  if (!existsSync(root)) return;
  for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const bin = path.join("node_modules", "@esbuild", dir.name, "bin", "esbuild");
    try { if (existsSync(bin)) chmodSync(bin, 0o755); } catch { /* not allowed here */ }
  }
}

// `prisma db push` runs Prisma's schema engine, a program inside node_modules. After a hosting change it arrived
// without permission to run (EACCES). So: make the engines runnable; if that is not allowed in this folder, run a copy
// from the temp folder; if even that fails, carry on — the database already has the tables from earlier deploys,
// and only brand-new columns would be missing until the next successful push.
function dbPush() {
  const dir = path.join("node_modules", "@prisma", "engines");
  const engines = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("schema-engine")) : [];
  for (const f of engines) { try { chmodSync(path.join(dir, f), 0o755); } catch { /* not allowed here */ } }
  try { run("npx prisma db push --skip-generate"); return; } catch (e) { console.warn(`db push failed (${e.message.split("\n")[0]}); trying a copy of the schema engine in the temp folder`); }
  try {
    const tmp = path.join(tmpdir(), "prisma-engines");
    mkdirSync(tmp, { recursive: true });
    for (const f of engines) {
      const to = path.join(tmp, f);
      copyFileSync(path.join(dir, f), to);
      chmodSync(to, 0o755);
      process.env.PRISMA_SCHEMA_ENGINE_BINARY = to;
      try { run("npx prisma db push --skip-generate"); return; } catch { /* try the next engine build */ }
    }
  } catch (e) { console.warn(`Could not use a temp copy: ${e.message}`); }
  delete process.env.PRISMA_SCHEMA_ENGINE_BINARY;
  console.warn("WARNING: database schema update (prisma db push) skipped — the schema engine can't run on this server. The site still builds with the existing tables.");
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
    const odd = [...pass].filter((c) => !/[A-Za-z0-9]/.test(c));
    const hidden = odd.filter((c) => /[\s​-‍⁠﻿]/.test(c)).length;
    console.log(`  password: ${[...pass].length} characters, ${odd.length} not a letter or number${hidden ? `, ${hidden} space/invisible!` : ""}`);
  } catch {
    console.warn("WARNING: DATABASE_URL is not a valid URL");
  }
}
