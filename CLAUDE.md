# AMS — standing rules from the owner

## Apps & features switches (always)
- Every app has a master on/off switch, and every feature inside it its own switch, in
  **Settings → Company → Apps & features** (`src/lib/features.ts`: `APP_SWITCHES` + `FEATURES`).
- When you add a new app: add it to `APP_SWITCHES` and an `app-<key>` entry in `FEATURES` with all its paths.
- When you add a new feature/section to any app: add a `FEATURES` entry with `app: "<app>"` and its paths, so it can be
  switched off on its own. Switched off = gone from every menu, pages show a notice, data kept.
- My Space, Tutorials and Settings stay always on.

## Working rules
- All work goes to `main`; commits are authored by ASX Labs with no AI attribution lines.
- Never commit uploaded spreadsheets, CSVs or personal HR data (CNIC, salaries, IBANs) — only code and layouts.
- Hostinger runs `prisma db push` without accept-data-loss: only new nullable/defaulted columns or new tables; no new
  `@unique` on existing tables.
- Forms inside a Drawer close after a successful save (AfterSave context); create dialogs pass `successHref`.
- The owner has auto-deployment on push: don't tell them to press Redeploy.
