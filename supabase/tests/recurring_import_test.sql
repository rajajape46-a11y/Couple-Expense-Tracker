-- Tests for part 2 (recurring rules, imports, monthly view). Runs after
-- rls_test.sql in the same throwaway database. Plain Postgres only.
\set QUIET on
\ir ../migrations/20261019000000_recurring_import_summary.sql

-- ---- 1. occurrence dates ------------------------------------------------------
do $$ begin
  assert public.rule_occurrence('2026-01-31', 'monthly', 1) = '2026-02-28';
  assert public.rule_occurrence('2026-01-31', 'monthly', 2) = '2026-03-31';
  assert public.rule_occurrence('2028-01-31', 'monthly', 1) = '2028-02-29';
  assert public.rule_occurrence('2026-10-01', 'fortnightly', 2) = '2026-10-29';
  assert public.rule_occurrence('2026-10-01', 'weekly', 1) = '2026-10-08';
  assert public.rule_occurrence('2024-02-29', 'yearly', 1) = '2025-02-28';
  raise notice 'PASS R1: occurrence dates incl. month-end and leap years';
end $$;

-- ---- 2. Raja creates a monthly rent rule (as the app would) --------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.recurring_rules
  (merchant, category_id, subcategory_id, expense_type, paid_by, amount, frequency, start_date)
select 'Rent', c.id, s.id, 'Fixed Needs', p.id, 2595, 'monthly', '2026-01-31'
from public.categories c
join public.subcategories s on s.category_id = c.id and s.name = 'Rent'
join public.people p on p.name = 'Raja'
where c.name = 'Housing & Rent';
commit;

-- ---- 3. generation up to a given day, idempotent ------------------------------
do $$
declare n1 int; n2 int; dates date[];
begin
  n1 := public.generate_recurring_transactions('2026-04-15');
  n2 := public.generate_recurring_transactions('2026-04-15');
  select array_agg(txn_date order by txn_date) into dates
  from public.transactions where merchant = 'Rent' and recurring_rule_id is not null;
  assert n1 = 3, format('expected 3 created, got %s', n1);
  assert n2 = 0, format('second run should create 0, got %s', n2);
  assert dates = array['2026-01-31','2026-02-28','2026-03-31']::date[], dates::text;
  raise notice 'PASS R2: catch-up creates Jan 31, Feb 28, Mar 31 once; re-run creates nothing';
end $$;

-- ---- 4. pause and end date ----------------------------------------------------
do $$
declare n int;
begin
  update public.recurring_rules set is_active = false where merchant = 'Rent';
  n := public.generate_recurring_transactions('2026-08-01');
  assert n = 0, 'paused rule created rows';
  update public.recurring_rules set is_active = true, end_date = '2026-05-31' where merchant = 'Rent';
  n := public.generate_recurring_transactions('2026-12-31');
  assert n = 2, format('expected Apr+May only, got %s', n);  -- Apr 30, May 31
  raise notice 'PASS R3: paused rules skip; end date stops generation';
end $$;

-- ---- 5. unique occurrence enforced even for direct inserts ---------------------
do $$
declare ok boolean := false;
begin
  begin
    insert into public.transactions
      (household_id, txn_date, merchant, category_id, expense_type, paid_by, amount, recurring_rule_id, recurring_date)
    select t.household_id, t.txn_date, t.merchant, t.category_id, t.expense_type, t.paid_by, t.amount, t.recurring_rule_id, t.recurring_date
    from public.transactions t where t.recurring_rule_id is not null limit 1;
  exception when unique_violation then ok := true;
  end;
  assert ok, 'duplicate occurrence accepted';
  raise notice 'PASS R4: a rule occurrence can never be stored twice';
end $$;

-- ---- 6. run_my_recurring only touches the caller's household -------------------
-- stranger (from rls_test) gets a rule too
insert into public.subcategories (household_id, category_id, name)
select household_id, id, 'Stranger sub' from public.categories where name = 'Stranger cat';
insert into public.recurring_rules
  (household_id, merchant, category_id, expense_type, paid_by, amount, frequency, start_date)
select c.household_id, 'Stranger rule', c.id, 'Fixed Needs', p.id, 1, 'weekly', current_date - 14
from public.categories c join public.people p on p.name = 'Stranger' where c.name = 'Stranger cat';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  perform public.run_my_recurring();
  raise notice 'PASS R5a: app user can run catch-up for own household';
end $$;
commit;
do $$ begin
  assert (select count(*) from public.transactions where merchant = 'Stranger rule') = 0,
    'Raja''s catch-up generated rows for another household';
  raise notice 'PASS R5b: catch-up never touches another household';
end $$;

-- ---- 7. app user cannot call the global generator ------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    perform public.generate_recurring_transactions();
    raise exception 'authenticated user could run the global generator';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS R6: global generator is not callable from the app';
end $$;
commit;

-- ---- 8. import RPC: atomic insert + record, RLS applies -------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare imp uuid; rows jsonb; cat uuid; sub uuid; me uuid; n int;
begin
  select id into cat from public.categories where name = 'Transport';
  select id into sub from public.subcategories where name = 'Fuel';
  select id into me from public.people where name = 'Raja';
  rows := jsonb_build_array(
    jsonb_build_object('txn_date','2026-10-20','merchant','Shell','category_id',cat,'subcategory_id',sub,
      'expense_type','Variable Wants','paid_by',me,'split_type','shared','amount',60.5),
    jsonb_build_object('txn_date','2026-10-21','merchant','BP','category_id',cat,'subcategory_id',sub,
      'expense_type','Variable Wants','paid_by',me,'split_type','shared','amount',41,'is_one_off',false));
  imp := public.import_transactions('test.xlsx', rows, 5);
  select count(*) into n from public.transactions where import_id = imp;
  assert n = 2, format('expected 2 imported, got %s', n);
  assert (select rows_added = 2 and rows_skipped = 5 from public.imports where id = imp);
  raise notice 'PASS R7: import inserts rows and records counts';
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare ok boolean := false; raja_cat uuid := (select id from public.categories where name = 'Transport');
begin
  -- stranger can't even see Raja's category, so pass a guessed id via the import
  begin
    perform public.import_transactions('evil.xlsx',
      jsonb_build_array(jsonb_build_object('txn_date','2026-10-20','merchant','x',
        'category_id', coalesce(raja_cat, gen_random_uuid()),'expense_type','Fixed Needs',
        'paid_by', gen_random_uuid(),'split_type','shared','amount',1)), 0);
  exception when raise_exception or foreign_key_violation then ok := true;
  end;
  assert ok, 'stranger import into foreign category succeeded';
  raise notice 'PASS R8: imports cannot reference another household';
end $$;
commit;

-- ---- 9. monthly view respects RLS -------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare oct numeric;
begin
  select sum(total) into oct from public.monthly_category_totals where month = '2026-10-01';
  assert oct is not null and oct > 0, 'Jo sees no October totals';
  raise notice 'PASS R9: Jo sees monthly totals (Oct = %)', oct;
end $$;
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from public.monthly_category_totals
          where household_id <> '99999999-9999-9999-9999-999999999999') = 0,
    'stranger sees other household totals';
  raise notice 'PASS R10: monthly view hides other households';
end $$;
commit;

\echo 'ALL PART-2 TESTS PASSED'
