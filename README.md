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

## Integrations

Settings → Integrations shows setup status, keys and recent deliveries.

- **Email:** set the `SMTP_*` env vars (see `.env.example`). Until then, emails are logged on the timeline but not sent.
- **Website forms:** `POST /api/webhooks/lead` with the API key. Duplicates by phone or email are merged into the open lead. New leads are assigned round-robin.
- **Facebook/Instagram Lead Ads:** webhook `/api/webhooks/facebook`, with `FB_APP_SECRET` and `FB_PAGE_TOKEN`. This needs the public HTTPS deployment.

## Deploy to Hostinger (Node.js Web App)

1. hPanel → **Databases → MySQL**: create a database and user. Note the host, name, user and password.
2. Node.js app → **Build configuration**: Framework **Next.js**, branch **main**, Node **22.x**, root **./**, package manager **npm**.
   - Build command: leave it as `npm run build`. When `DATABASE_URL` is a `mysql://` URL it switches to MySQL, creates/updates tables, seeds configuration, then builds (`npm run build:hostinger` does the same explicitly)
   - Output directory: `.next`
3. **Environment variables** (required): `DATABASE_URL=mysql://USER:PASS@HOST:3306/DBNAME`, `SEED_DEMO=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ chars), `ADMIN_NAME`, `APP_URL=https://your-domain`, `CRON_SECRET` (long random string), `APP_TIMEZONE=Asia/Karachi`.
   Optional: `UPLOAD_DIR` (a folder outside the app so photos and documents survive redeploys), `SMTP_*`, `FB_APP_SECRET`, `FB_PAGE_TOKEN`.
4. Deploy. Sign in with ADMIN_EMAIL / ADMIN_PASSWORD, then create users and employees.
5. hPanel → **Advanced → Cron Jobs**: once a day, fetch `https://your-domain/api/cron/daily?key=<CRON_SECRET>`.
