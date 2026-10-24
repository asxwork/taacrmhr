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
3. **Environment variables** (required): `DATABASE_URL=mysql://USER:PASS@localhost:3306/DBNAME`, `SEED_DEMO=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10+ chars), `ADMIN_NAME`, `APP_URL=https://your-domain`, `CRON_SECRET` (long random string), `APP_TIMEZONE=Asia/Karachi`.
   - Host is `localhost`: the build and the app run on the hosting account itself. User and database names carry the account prefix (`u123456789_…`).
   - Use a letters-and-numbers database password. `@ # ? / %` break the URL and `$` can be mangled when Hostinger writes `.env`. The build log prints the user, host, database and password length (never the password) to check against hPanel.
   - `UPLOAD_DIR` (strongly recommended): an absolute folder outside the app, e.g. `/home/u123456789/domains/your-domain/uploads`. Each deploy publishes into a fresh version folder, so uploads kept in the default `./uploads` are lost on redeploy.
   Optional: `SMTP_*`, `FB_APP_SECRET`, `FB_PAGE_TOKEN`.
4. Deploy. Sign in with ADMIN_EMAIL / ADMIN_PASSWORD, change the password under **Me**, then remove `ADMIN_PASSWORD` from the environment (it is only used to create the first admin).
5. A new subdomain needs a DNS **A** record (name = subdomain, value = the site's IP from the hPanel dashboard) and an SSL certificate (hPanel → Security → SSL).
6. hPanel → **Advanced → Cron Jobs**: once a day, run `curl -s "https://your-domain/api/cron/daily?key=<CRON_SECRET>" > /dev/null` (Hostinger cron runs in UTC: `0 2 * * *` is 07:00 in Karachi).

Production builds don't use Turbopack and pages render per request (`force-dynamic`), so the build never queries the database while prerendering. Both avoid Hostinger's per-account process/thread limits.
