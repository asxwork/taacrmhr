# The Advisor Associates — CRM & HR Platform

Next.js 15 (App Router) · Prisma · Tailwind v4. The full roadmap is in [`../PLAN.md`](../PLAN.md).

## Run locally

```bash
npm install
npm run db:push     # creates prisma/dev.db (SQLite)
npm run db:seed     # branches, roles, lead sources, demo users
npm run dev         # http://localhost:3000
```

Demo logins are listed at the top of [`prisma/seed.ts`](prisma/seed.ts). They are for local use only; delete them before go-live.

`npm run db:reset` wipes and re-seeds the local database.

## Access control

- Permissions are **module × action × scope** (`none / own / team / branch / all`), defined in [`src/lib/rbac.ts`](src/lib/rbac.ts).
- Every page or server action calls `requirePermission(module, action)`. Every record query must use `scopeWhere(user, module)` from [`src/lib/permissions.ts`](src/lib/permissions.ts). This is what stops an agent from opening someone else's record by URL.
- **Team** means the user plus everyone under them in the "Reports to" chain.
- **Super Admin** is a per-user flag that bypasses roles.
- The sidebar ([`src/lib/nav.ts`](src/lib/nav.ts)) shows only modules the user can view.

## Deploy to Hostinger (Node.js Web App)

1. In hPanel, create a MySQL database.
2. Set env vars: `DATABASE_URL="mysql://USER:PASS@HOST:3306/DB"` and `CRON_SECRET`.
3. Build command: `npm run db:use-mysql && npm install && npx prisma db push && npm run build`.
4. Start command: `npm start`.
5. Seed once with `npm run db:seed`, then change the admin password and remove the demo users.

Proper Prisma migrations will replace `db push` before go-live (Phase 8).
