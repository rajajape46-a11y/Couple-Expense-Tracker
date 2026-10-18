# End-to-end browser tests (optional)

* `e2e_test.py` – 24 checks: login, merchant memory, save & add another,
  validation, edit, search, month navigation, soft delete, categories, second
  user, sign-out protection.
* `e2e_test2.py` – 35 checks: summary pages, Excel export (layout, charts,
  dropdowns, recalculated totals), re-importing the export (all duplicates),
  importing the original v2 and v1 workbooks, partial overlaps, unknown
  categories, undo, recurring expenses (catch-up, no duplicates, pause,
  edit-future-only, from an existing expense, delete keeps history).

They were run against a local stand-in for Supabase so no real project is touched:

* local Postgres with both `supabase/migrations` + `supabase/setup/01_setup_household.sql`
  loaded (plus a small `auth` stub – see `supabase/tests/rls_test.sql`)
* [PostgREST](https://postgrest.org) using `pgrst.conf`
* `gateway.mjs` – a tiny fake of Supabase's login API that proxies `/rest/v1` to PostgREST
  (test logins: `raja@example.com` / `jo@example.com`, password `test1234`)
* the app built with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`

Setting that up is Linux/WSL-oriented; day-to-day you can test against your
real Supabase project instead.
