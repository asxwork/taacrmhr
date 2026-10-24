// Switches prisma/schema.prisma from SQLite (local dev) to MySQL (Hostinger).
// Usage: node scripts/use-mysql.mjs   (run before `prisma migrate deploy` in production)
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../prisma/schema.prisma", import.meta.url);
let schema = readFileSync(path, "utf8");

schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "mysql"');
// Long-text fields are tagged `// @text`; MySQL needs @db.Text beyond 191 chars.
schema = schema.replace(/^(\s*\w+\s+String\??)(\s*)\/\/ @text/gm, "$1 @db.Text$2// @text");

writeFileSync(path, schema);
console.log("schema.prisma now targets MySQL");
