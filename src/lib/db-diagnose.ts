// Turns a database error into a plain explanation (no hosts, users or passwords), for the status page and login.
export function explainDbError(e: unknown): { code: string; meaning: string; detail?: string } {
  const err = e as { code?: string; errorCode?: string; meta?: { table?: string; column?: string; modelName?: string }; message?: string };
  const code = err?.code || err?.errorCode || "unknown";
  const meanings: Record<string, string> = {
    P1000: "Database username or password is wrong (check DATABASE_URL in hPanel).",
    P1001: "Can't reach the database server (is MySQL running / is the host right?).",
    P1002: "The database server timed out.",
    P1003: "The database named in DATABASE_URL doesn't exist.",
    P1017: "The database closed the connection (too many connections or it restarted).",
    P2021: "A table is missing: the database wasn't updated during the last deploy.",
    P2022: "A column is missing: the database wasn't updated during the last deploy.",
    P2024: "Timed out waiting for a database connection (too many at once).",
  };
  const detail = err?.meta?.table ?? err?.meta?.column ?? err?.meta?.modelName;
  const fallback = /Can't reach|ECONNREFUSED|ETIMEDOUT/i.test(err?.message ?? "") ? meanings.P1001! : /Access denied|authentication/i.test(err?.message ?? "") ? meanings.P1000! : "Unexpected database error.";
  return { code, meaning: meanings[code] ?? fallback, ...(detail ? { detail: String(detail) } : {}) };
}
