# End-to-end browser test (optional)

`e2e_test.py` drives the real app in a phone-sized Chromium window (Playwright)
and checks 24 things: login, merchant memory, save & add another, validation,
edit, search, month navigation, soft delete, category management, a second
user seeing the same data, and sign-out protection.

It was run against a local stand-in for Supabase so no real project is touched:

* local Postgres with `supabase/migrations` + `supabase/setup/01_setup_household.sql` loaded
  (plus a small `auth` stub – see `supabase/tests/rls_test.sql`)
* [PostgREST](https://postgrest.org) using `pgrst.conf`
* `gateway.mjs` – a tiny fake of Supabase's login API that proxies `/rest/v1` to PostgREST
  (test logins: `raja@example.com` / `jo@example.com`, password `test1234`)
* the app built with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`

Setting that up is Linux/WSL-oriented and only worth it if you want to re-run
the suite; day-to-day you can test against your real Supabase project instead.
