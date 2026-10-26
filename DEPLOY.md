# Deploying and running on Hostinger

How the live site (https://ams.theadvisorassociates.com) is built, configured and kept healthy.
The app is a Next.js Node.js web app with a MySQL database, deployed from GitHub (`asxwork/taacrmhr`, branch `main`).

---

## 1. How a deploy works

Every push to `main` is ready to deploy. In hPanel you press **Redeploy**, and Hostinger runs `npm run build`, which runs [`scripts/build.mjs`](scripts/build.mjs). With a `mysql://` `DATABASE_URL`, that script:

1. Switches the Prisma schema from SQLite to MySQL (`scripts/use-mysql.mjs`).
2. Creates or updates the database tables (`prisma db push`). It adds new tables and columns and never drops data.
3. Runs the seed (`prisma/seed.ts`). It only fills blanks: branches, roles, lead sources, pipelines, leave types, holidays, tax slabs and so on. Anything you edited in Settings is kept.
4. Builds the app (`next build`).

So **a redeploy is all it takes** to ship code and database changes. There is no separate migration step.

---

## 2. First-time setup

1. **Database.** hPanel → Databases → MySQL Databases. Create a database and a user. The names get the account prefix (`u615121755_…`). Use a password made of **letters and numbers only**.
2. **Node.js app.** hPanel → Websites → Add website → Node.js app → connect GitHub, branch `main`.
   - Framework: Next.js · Node 22.x · root `./` · package manager npm
   - Build command: `npm run build` (fixed) · output directory: `.next`
3. **Environment variables**: see the table below.
4. **Deploy.** Then sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, change the password under **My Profile**, and **delete `ADMIN_PASSWORD`** from the environment variables. It's only used once, to create the first admin.
5. **Domain.** For a subdomain, add a DNS **A** record (name = subdomain, value = the server IP from the hPanel dashboard) and issue an SSL certificate (hPanel → Security → SSL).
6. **Daily job.** hPanel → Advanced → Cron Jobs, once a day:
   ```
   curl -s "https://ams.theadvisorassociates.com/api/cron/daily?key=<CRON_SECRET>" > /dev/null
   ```
   Cron runs in UTC, so `0 2 * * *` means 07:00 in Karachi. The job sends "forgot to check out" reminders and HR heads-ups (probation ending, CNIC or documents expiring).

---

## 3. Environment variables

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | `mysql://USER:PASSWORD@localhost:3306/DBNAME`. The host is `localhost` on Hostinger. |
| `SEED_DEMO` | yes | `false` on the live site. (`true`, or leaving it unset, creates the local test logins.) |
| `ADMIN_EMAIL`, `ADMIN_NAME` | first deploy | The first Super Admin. Nothing changes if that user already exists. |
| `ADMIN_PASSWORD` | first deploy | 10+ characters. **Remove it after the first sign-in.** |
| `APP_URL` | yes | `https://ams.theadvisorassociates.com`, used in email links. |
| `CRON_SECRET` | yes | A long random string. The daily job URL must carry it. |
| `APP_TIMEZONE` | recommended | `Asia/Karachi` (also the default). Attendance, leave and reports use it. |
| `UPLOAD_DIR` | **strongly recommended** | `/home/u615121755/domains/ams.theadvisorassociates.com/uploads`. Each deploy goes into a fresh folder, so without this, photos, documents, receipts and CVs **are lost on every redeploy**. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional | Outgoing email (Hostinger: `smtp.hostinger.com`, port `465`). Until these are set, emails show on the timeline but aren't sent. |
| `FB_APP_SECRET`, `FB_PAGE_TOKEN` | optional | Facebook / Instagram Lead Ads. See Settings → Integrations. |

After changing environment variables, **Redeploy** so the app picks them up.

---

## 4. Routine redeploy

1. Changes are pushed to `main` on GitHub.
2. hPanel → the Node.js app → **Redeploy**.
3. Watch the build log. It should end with `✓ Compiled successfully` and the route list.
4. Open the site and sign in. Hard-refresh (Ctrl+Shift+R) if a page looks stale.

---

## 5. Sample data

On the **first** deploy against an empty database, the seed loads sample data once:
- 6 staff on `@demo.local`. Their random passwords are unknown to anyone, so nobody can sign in as them.
- Leads, deals and contacts.
- Two projects (Advisor Heights, Palm Residency) and 4 agent listings.
- Employees with attendance, salaries, a loan and an expense.

To clear it before go-live: **Settings → Company & Branches → Sample data → tick "Delete all sample records" → Remove sample data**. It deletes the sample users and everything they own, plus the two sample projects. Records you created yourself stay. A flag in the database stops later deploys from adding it back. A Super Admin can reload it from the same place.

---

## 6. Go-live checklist

- [ ] Remove the sample data (section 5).
- [ ] `UPLOAD_DIR` set to a folder outside the app (section 3).
- [ ] Admin password changed, and `ADMIN_PASSWORD` removed from the environment.
- [ ] Daily cron job added (section 2, step 6).
- [ ] **Payroll → Settings & tax:** confirm the FY 2026-27 income-tax slabs against the Finance Act 2026, plus the EOBI employee/employer amounts. The seeded 2026-27 slabs are a copy of 2025-26.
- [ ] **HR Settings → Holidays:** confirm the Islamic holiday dates against the official notification (the seeded dates are estimates).
- [ ] **HR Settings:** employee code prefix, probation months, onboarding/offboarding checklists, shifts.
- [ ] **CRM Settings:** lead sources, statuses, pipelines and stages.
- [ ] Create users (Settings → Users) and roles, or import employees (HR → Employees → Import, with the CSV template) and create logins from each profile.
- [ ] SMTP set, if emails should actually go out.
- [ ] Old database `u615121755_ams` deleted in hPanel (its password was exposed earlier).

---

## 7. Day-to-day operations

- **Attendance from the ZKTeco K40:** on the device, Menu → USB Manager → Download → Attendance. Then in the app, **HR → Attendance → Import from device** and upload `attlog.dat`. Already-imported punches are skipped, so uploading the full log each time is fine. Employees are matched by **Device ID** on their profile.
- **Payroll:** HR → Payroll → create the month's run → check → Approve → Mark paid. The bank transfer sheet and payroll register download from the run page.
- **Website leads:** `POST /api/webhooks/lead` with the API key from Settings → Integrations.
- **Audit log:** Settings → Audit Log records sign-ins (including failed ones), changes, exports and deletions.

---

## 8. Backups

Hostinger's automatic backups cover files and databases, but take your own too:

- **Database:** hPanel → Databases → phpMyAdmin → select the database → **Export** (Quick, SQL). Do this weekly, and always before a large import.
- **Uploads:** download the `UPLOAD_DIR` folder (File Manager → compress → download) monthly.

To restore the database: phpMyAdmin → Import the `.sql` file into an empty database, point `DATABASE_URL` at it, then Redeploy.

---

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build log: `P1000 Authentication failed` | The database user or password is wrong. The log prints the user, host, database and password **length**; compare these with hPanel. Use a letters-and-numbers password. |
| Build log: `WARNING: DATABASE_URL password contains unencoded @ # or ?` | Change the database password to letters and numbers only and update `DATABASE_URL`. |
| Uploaded photos/documents disappear after a deploy | `UPLOAD_DIR` isn't set. Set it (section 3) and redeploy. Files uploaded before that are gone. |
| "Too many failed attempts. Try again in N minutes" | 5 wrong passwords for one email (or 20 from one network) within 15 minutes. Wait it out, or restart the app in hPanel to clear the counter. |
| Someone can't sign in at all | Settings → Users: check the account is **Active**, and reset the password. Employees marked **Left** are deactivated automatically. |
| A user sees a module they shouldn't (or can't see one they should) | Settings → Roles & Permissions. Check the role's scope for that module (none / own / team / branch / all). **Team** follows the "Reports to" chain on the employee profile. |
| Attendance shows people absent who were in | Their **Device ID** on the employee profile doesn't match the ID on the K40, or the latest `attlog.dat` hasn't been imported yet. |
| Payslips show the wrong tax | Payroll → Settings & tax: check the slabs for that fiscal year (July–June). |
| Page looks broken after a deploy | Hard-refresh (Ctrl+Shift+R). If it persists, check the build log finished and Redeploy. |

---

## 10. Local development

See [README.md](README.md). In short: `npm install`, `npm run db:push`, `npm run db:seed`, `npm run dev`, then sign in at http://localhost:3000 with the test logins listed at the top of [`prisma/seed.ts`](prisma/seed.ts).

Before pushing, run `npm run build` locally. A push to `main` is what the live site deploys, so it must build. If the local dev server shows blank pages after a production build, stop it, delete `.next`, and start it again.
