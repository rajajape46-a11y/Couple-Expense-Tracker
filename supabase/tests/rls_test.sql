-- Local test harness (plain Postgres, NOT for Supabase): stubs Supabase's auth
-- schema, then checks the schema, the import and the row-level security rules.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql (see README)
\set QUIET on

-- ---- Supabase stubs --------------------------------------------------------
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'raja@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'jo@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

\ir ../migrations/20261018000000_init.sql
\ir /tmp/seed_for_test.sql

-- a second, unrelated household for the stranger
insert into public.households (id, name) values ('99999999-9999-9999-9999-999999999999', 'Other');
insert into public.household_members values ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333');

-- ---- 1. import totals ------------------------------------------------------
do $$
declare n int; total numeric; oneoff numeric;
begin
  select count(*), sum(amount), sum(amount) filter (where is_one_off) into n, total, oneoff from public.transactions;
  assert n = 56, format('expected 56 rows, got %s', n);
  assert total = 10891.09, format('expected total 10891.09, got %s', total);
  assert oneoff = 7116, format('expected one-off 7116, got %s', oneoff);
  raise notice 'PASS 1: import = % rows, $%, one-off $%', n, total, oneoff;
end $$;

-- ---- 2. Raja sees everything in his household -----------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int; c int; p int;
begin
  select count(*) into n from public.transactions;
  select count(*) into c from public.categories;
  select count(*) into p from public.people;
  assert n = 56 and c = 11 and p = 2, format('raja sees %s txns %s cats %s people', n, c, p);
  raise notice 'PASS 2: Raja sees 56 transactions, 11 categories, 2 people';
end $$;

-- ---- 3. Raja can insert without sending household_id ----------------------
do $$
declare cat uuid; sub uuid; me uuid; newid uuid;
begin
  select id into cat from public.categories where name = 'Transport';
  select id into sub from public.subcategories where name = 'Public Transport (Myki)';
  select id into me from public.people where name = 'Raja';
  insert into public.transactions (txn_date, merchant, category_id, subcategory_id, expense_type, paid_by, amount)
  values (current_date, 'Myki Top Up', cat, sub, 'Fixed Needs', me, 10) returning id into newid;
  assert (select household_id from public.transactions where id = newid) =
         (select household_id from public.people where id = me);
  raise notice 'PASS 3: insert works and household is filled in automatically';
end $$;
commit;

-- ---- 4. Jo (same household) sees Raja's new row ---------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.transactions) = 57;
  raise notice 'PASS 4: Jo sees all 57 shared rows';
end $$;
commit;

-- ---- 5. A stranger sees nothing and cannot write into Raja's household ------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare raja_hh uuid := (select household_id from public.household_members where user_id = '11111111-1111-1111-1111-111111111111');
begin
  assert (select count(*) from public.transactions) = 0, 'stranger can see transactions!';
  assert (select count(*) from public.categories) = 0, 'stranger can see categories!';
  assert raja_hh is null, 'stranger can see membership!';
  begin
    insert into public.categories (household_id, name)
    values ((select household_id from public.people limit 1), 'Hack');
    -- people is invisible too, so household_id is null -> not-null violation is also fine
    raise exception 'stranger insert should have failed';
  exception when not_null_violation or insufficient_privilege or check_violation then
    null;
  end;
  update public.transactions set amount = 1;  -- affects 0 rows under RLS
  raise notice 'PASS 5: stranger sees 0 rows and cannot write';
end $$;
commit;

-- ---- 6. Cross-household references are rejected ---------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.categories (name) values ('Stranger cat');
insert into public.people (name) values ('Stranger');
commit;
do $$
declare raja_cat uuid; stranger_person uuid; ok boolean := false;
begin
  select id into raja_cat from public.categories where name = 'Transport';
  select id into stranger_person from public.people where name = 'Stranger';
  begin
    insert into public.transactions (household_id, txn_date, merchant, category_id, expense_type, paid_by, amount)
    values ('99999999-9999-9999-9999-999999999999', current_date, 'x', raja_cat, 'Fixed Needs', stranger_person, 5);
  exception when raise_exception then ok := true;
  end;
  assert ok, 'cross-household category reference was accepted';
  raise notice 'PASS 6: cross-household references rejected by trigger';
end $$;

-- ---- 7. Data rules -----------------------------------------------------------
do $$
declare cat uuid; me uuid; ok boolean := false;
begin
  select id into cat from public.categories where name = 'Transport';
  select id into me from public.people where name = 'Raja';
  begin
    insert into public.transactions (household_id, txn_date, merchant, category_id, expense_type, paid_by, split_type, amount)
    values ((select household_id from public.people where id = me), current_date, 'x', cat, 'Fixed Needs', me, 'personal', 5);
  exception when check_violation then ok := true;
  end;
  assert ok, 'personal split without person accepted';
  raise notice 'PASS 7: personal split requires a person';
end $$;

-- ---- 8. Anonymous visitors get nothing ------------------------------------
begin;
set local role anon;
do $$ begin
  begin
    perform 1 from public.transactions;
    raise exception 'anon could read transactions';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 8: anonymous access denied';
end $$;
commit;

\echo 'ALL TESTS PASSED'
