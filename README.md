# Couple Expense Tracker

A mobile-first web app for Raja & Jo to log and review shared expenses — the
web version of `Monthly expense log v2.xlsx`. Built with **Next.js 16**,
**Supabase** (Postgres + Auth) and designed to be hosted free on **Vercel**.

## What it does (phase 1 & 2)

- **Sign in** with email + password (no public sign-up – only the two of you).
- **Quick add** from your phone: amount first, date defaults to today, tap a
  recent merchant and the category, sub-category, expense type, split and
  payment method fill in from the last time you used it.
  "Save & add another" for logging several receipts in a row.
- **Expenses list** by month, grouped by day, with search and category filter.
  Tap any row to edit or delete it (deletes are soft – nothing is lost).
- **Home**: this month's total, fixed vs variable, spend by category against
  budget, the all-time **settle-up** ("Jo owes Raja $…") and recent entries.
- **Settings**: add / rename / hide categories and sub-categories and set
  monthly budgets – the Add screen updates immediately.
- **Installable on your phone** (Add to Home Screen) with its own icon.
- **Secure by default**: row-level security means each login only ever sees its
  own household; anonymous visitors get nothing.
- **Keep-alive**: a daily Vercel cron pings Supabase so the free project isn't paused.

Your 56 existing transactions and the cleaned-up categories are imported by a
one-time setup script.

---

## 1. Run it on your computer

Prerequisites: [Node.js 20.9+](https://nodejs.org) and Git.

```bash
npm install
cp .env.example .env.local     # Windows PowerShell: copy .env.example .env.local
# fill in .env.local (see step 2)
npm run dev
```

Open http://localhost:3000.

## 2. Set up Supabase (one time, ~10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (pick the
   **Sydney** region). Save the database password somewhere safe.
2. **SQL Editor → New query**: paste all of
   `supabase/migrations/20261018000000_init.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user** for each of you
   (email + password, tick **Auto Confirm User**).
4. **Authentication → Sign In / Providers**: turn **off** "Allow new users to
   sign up", so nobody else can create an account.
5. **SQL Editor**: open `supabase/setup/01_setup_household.sql`, replace
   `REPLACE_WITH_RAJA_EMAIL` and `REPLACE_WITH_JO_EMAIL` with your two login
   emails, paste → **Run**. You should see
   *"Done: household created and 56 transactions imported."*
   (If Jo's login doesn't exist yet, run `02_link_second_person.sql` later.)
6. **Project Settings → API Keys** (or the **Connect** button): copy the
   **Project URL** and the **publishable key** (`sb_publishable_…`, or the
   legacy `anon public` key) into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   CRON_SECRET=any-long-random-string
   ```

   Never put the **secret / service_role** key in this app or in Git.

## 3. Push to GitHub

```bash
git remote add origin https://github.com/rajajape46-a11y/Couple-Expense-Tracker.git
git push -u origin main
```

If GitHub says the push was rejected because the repository already has
commits (e.g. a README created on github.com), run this once and push again:

```bash
git pull origin main --allow-unrelated-histories --no-rebase
git push -u origin main
```

`.env.local` is git-ignored, so your keys are never pushed.

## 4. Deploy on Vercel (free Hobby plan)

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the
   GitHub repository (framework is detected as Next.js).
2. Add the three **Environment Variables** from `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `CRON_SECRET`) → **Deploy**.
3. In Supabase → **Authentication → URL Configuration**, set **Site URL** to
   your Vercel address (e.g. `https://couple-expense-tracker.vercel.app`).
4. Every `git push` to `main` redeploys automatically. The daily keep-alive job
   in `vercel.json` is picked up automatically.

## 5. Put it on your phones

Open the Vercel URL and sign in, then:

- **iPhone (Safari)**: Share → **Add to Home Screen**.
- **Android (Chrome)**: ⋮ menu → **Install app** / **Add to Home screen**.

---

## Project structure

```
src/
  app/
    (app)/            signed-in pages: Home, add, transactions, settings
    login/            sign-in page
    api/keepalive/    daily ping for Vercel Cron
    actions.ts        all server actions (save/delete expense, categories, auth)
    manifest.ts       PWA manifest
  components/         transaction form, bottom nav, list rows
  lib/
    data.ts           data access (Supabase queries, merchant memory)
    split.ts          who-owes-whom maths
    supabase/         Supabase clients
  proxy.ts            refreshes the session, protects every page
supabase/
  migrations/         database schema + row-level security
  setup/              one-time household setup & data import
  tests/              SQL tests for import totals and security rules
tests/e2e/            optional Playwright browser test
```

## Testing

- `npm run lint` and `npx tsc --noEmit` – code checks.
- `supabase/tests/run_rls_test.sh` – loads the schema and import into a
  throwaway local Postgres and checks: 56 rows / $10,891.09 imported, both
  logins see shared data, a stranger sees nothing and can't write, cross-
  household references are rejected, anonymous access is denied.
- `tests/e2e/` – 24-step browser test (see its README).

## Roadmap

- **Phase 3 – Dashboard**: month picker, one-off toggle, category & trend
  charts, budget vs actual, biggest transactions, drill-down (like the Excel
  dashboard).
- **Phase 4 – Data in/out**: bank CSV import with duplicate detection, CSV /
  Excel export (also your backup).
- **Later**: recurring expenses (rent, mobile, insurance), receipt photos,
  record settle-up payments, budget alerts, offline entry.
