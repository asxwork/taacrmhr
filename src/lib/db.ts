import { PrismaClient } from "@prisma/client";
import { forget } from "./memo";
import { stampLeadWrite } from "./lead-hold-core";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Writes to these models drop the matching in-process caches (lib/memo.ts).
const CACHE_PREFIX: Record<string, string> = {
  User: "session:", UserRole: "session:", Role: "session:", Permission: "session:", UserPermission: "session:", FieldRule: "session:", Session: "session:", Branch: "session:",
  Setting: "setting:",
  LayoutProfile: "layout:",
  Pipeline: "pipelines", Stage: "pipelines",
  LeadStatus: "leadStatus:",
  // Cached attendance summaries (HR dashboard month-wise absents) are rebuilt when any input changes.
  AttendancePunch: "att:", AttendanceDay: "att:", LeaveRequest: "att:", Holiday: "att:", RosterDay: "att:", Employee: "att:", Shift: "att:",
};
const READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);

/**
 * MySQL on shared hosting (Hostinger) caps connections per database user. Keep each server process to a small
 * pool, and give up waiting after a while instead of hanging the page when the pool is busy.
 */
function datasourceUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("mysql://")) return undefined;
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", process.env.DB_CONNECTION_LIMIT ?? "5");
  if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
  if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "10");
  return u.toString();
}

const SIMULATE_DB_MS = Number(process.env.SIMULATE_DB_MS) || 0;

function createClient() {
  const base = new PrismaClient({ datasourceUrl: datasourceUrl() });
  const client = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Testing only: SIMULATE_DB_MS=30 adds that delay to every query, like a database on another server.
          if (SIMULATE_DB_MS) await new Promise((r) => setTimeout(r, SIMULATE_DB_MS));
          if (model === "Lead") await stampLeadWrite(base, operation, args as Parameters<typeof stampLeadWrite>[2]);
          const result = await query(args);
          const prefix = CACHE_PREFIX[model];
          if (prefix && !READS.has(operation)) forget(prefix);
          return result;
        },
      },
    },
  });
  // Same runtime API as PrismaClient; keep the plain type so helpers typed with PrismaClient accept it.
  return client as unknown as PrismaClient;
}

// One client (one connection pool) per server process, in production too: separate copies each opened their own
// pool and could use up the database's connection limit, making every page wait forever.
export const db = (globalForPrisma.prisma ??= createClient());
