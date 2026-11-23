# AMS — standing rules from the owner

## Apps & features switches (always)
- Every app has a master on/off switch, and every feature inside it its own switch, in
  **Settings → Company → Apps & features** (`src/lib/features.ts`: `APP_SWITCHES` + `FEATURES`).
- When you add a new app: add it to `APP_SWITCHES` and an `app-<key>` entry in `FEATURES` with all its paths.
- When you add a new feature/section to any app: add a `FEATURES` entry with `app: "<app>"` and its paths, so it can be
  switched off on its own. Switched off = gone from every menu, pages show a notice, data kept.
- My Space, Tutorials and Settings stay always on.

## Emails
- Every email link is a button with the plain link under it ("Button not working? Copy this link…"). With
  `brandedEmail` just put the link on its own line (`Label: https://…`, or a line ending in `:` then the link);
  custom HTML emails use `emailButton()` from `src/lib/email-template.ts`.

## Working rules
- All work goes to the `dev` branch; commits are authored by ASX Labs with no AI attribution lines. Every push to
  `main` makes Hostinger rebuild and restart the live site, so `dev` is merged into `main` once a day outside office
  hours (about 10 pm Pakistan time, by a scheduled task). Only an urgent fix the owner asks for goes straight to `main`
  (then merge `main` back into `dev`).
- Never commit uploaded spreadsheets, CSVs or personal HR data (CNIC, salaries, IBANs) — only code and layouts.
- Hostinger runs `prisma db push` without accept-data-loss: only new nullable/defaulted columns or new tables; no new
  `@unique` on existing tables.
- Forms inside a Drawer close after a successful save (AfterSave context); create dialogs pass `successHref`.
- The owner has auto-deployment on push to `main`: don't tell them to press Redeploy. Changes on `dev` go live with
  the nightly merge.
