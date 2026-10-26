import { PrismaClient } from "@prisma/client";
import { forget } from "./memo";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Writes to these models drop the matching in-process caches (lib/memo.ts).
const CACHE_PREFIX: Record<string, string> = {
  User: "session:", UserRole: "session:", Role: "session:", Permission: "session:", Session: "session:", Branch: "session:",
  Setting: "setting:",
  Pipeline: "pipelines", Stage: "pipelines",
};
const READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);

function createClient() {
  const base = new PrismaClient();
  const client = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
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

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
