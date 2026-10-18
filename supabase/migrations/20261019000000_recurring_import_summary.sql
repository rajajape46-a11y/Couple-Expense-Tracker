-- =============================================================================
-- Couple Expense Tracker – part 2: recurring expenses, Excel imports, summaries
-- Run once in Supabase → SQL Editor, AFTER 20261018000000_init.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Import history (so an import can be undone)
-- -----------------------------------------------------------------------------
create table public.imports (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
               references public.households(id) on delete cascade,
  file_name    text not null,
  rows_added   int  not null default 0,
  rows_skipped int  not null default 0,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  undone_at    timestamptz
);

-- -----------------------------------------------------------------------------
-- Recurring rules
-- -----------------------------------------------------------------------------
create table public.recurring_rules (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.current_household_id()
                 references public.households(id) on delete cascade,
  merchant       text not null check (length(trim(merchant)) > 0),
  category_id    uuid not null references public.categories(id),
  subcategory_id uuid references public.subcategories(id),
  expense_type   text not null check (expense_type in ('Fixed Needs', 'Variable Wants')),
  paid_by        uuid not null references public.people(id),
  split_type     text not null default 'shared' check (split_type in ('shared', 'personal')),
  personal_for   uuid references public.people(id),
  payment_method text check (payment_method in ('Card', 'Cash', 'Bank Transfer', 'Other')),
  amount         numeric(12,2) not null check (amount <> 0),
  is_one_off     boolean not null default false,
  notes          text,
  frequency      text not null check (frequency in ('weekly', 'fortnightly', 'monthly', 'yearly')),
  start_date     date not null,
  end_date       date,
  -- how many occurrences (counting from start_date = 0) have been created
  next_index     int  not null default 0 check (next_index >= 0),
  is_active      boolean not null default true,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rule_split_person_consistent check (
    (split_type = 'shared'   and personal_for is null) or
    (split_type = 'personal' and personal_for is not null)
  ),
  constraint rule_end_after_start check (end_date is null or end_date >= start_date)
);

-- Same "everything belongs to this household" check as transactions.
create trigger recurring_rules_refs_check
  before insert or update on public.recurring_rules
  for each row execute function public.check_transaction_refs();

-- Link generated / imported transactions back to their source.
alter table public.transactions
  add column recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  add column recurring_date    date,
  add column import_id         uuid references public.imports(id) on delete set null;

-- An occurrence of a rule can only ever exist once.
create unique index transactions_recurring_once
  on public.transactions (recurring_rule_id, recurring_date)
  where recurring_rule_id is not null;

-- Date of occurrence k (0 = start date). Monthly/yearly add calendar months
-- from the start date, so a rule on the 31st lands on the last day of shorter
-- months and returns to the 31st afterwards.
create or replace function public.rule_occurrence(p_start date, p_frequency text, p_k int)
returns date language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly'      then p_start + 7 * p_k
    when 'fortnightly' then p_start + 14 * p_k
    when 'monthly'     then (p_start + make_interval(months => p_k))::date
    when 'yearly'      then (p_start + make_interval(years => p_k))::date
  end
$$;

-- Creates every occurrence that is due (on or before p_today) for active rules.
-- Safe to run any number of times: an occurrence is never created twice.
create or replace function public.generate_recurring_transactions(
  p_today date default (now() at time zone 'Australia/Melbourne')::date,
  p_household uuid default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r       public.recurring_rules%rowtype;
  k       int;
  d       date;
  created int := 0;
  n       int;
begin
  for r in
    select * from public.recurring_rules
    where is_active and (p_household is null or household_id = p_household)
    for update skip locked
  loop
    k := r.next_index;
    loop
      d := public.rule_occurrence(r.start_date, r.frequency, k);
      exit when d > p_today or (r.end_date is not null and d > r.end_date) or k > r.next_index + 400;
      insert into public.transactions
        (household_id, txn_date, merchant, category_id, subcategory_id, expense_type,
         paid_by, split_type, personal_for, payment_method, amount, is_one_off, notes,
         created_by, recurring_rule_id, recurring_date)
      values
        (r.household_id, d, r.merchant, r.category_id, r.subcategory_id, r.expense_type,
         r.paid_by, r.split_type, r.personal_for, r.payment_method, r.amount, r.is_one_off, r.notes,
         null, r.id, d)
      on conflict (recurring_rule_id, recurring_date) where recurring_rule_id is not null
      do nothing;
      get diagnostics n = row_count;
      created := created + n;
      k := k + 1;
    end loop;
    if k <> r.next_index then
      update public.recurring_rules set next_index = k, updated_at = now() where id = r.id;
    end if;
  end loop;
  return created;
end $$;

-- Lets the app catch up its own household when someone opens it (a safety net
-- in case the daily job hasn't run yet).
create or replace function public.run_my_recurring()
returns int language plpgsql security definer set search_path = '' as $$
declare hid uuid := public.current_household_id();
begin
  if hid is null then return 0; end if;
  return public.generate_recurring_transactions(
    (now() at time zone 'Australia/Melbourne')::date, hid);
end $$;

revoke all on function public.generate_recurring_transactions(date, uuid) from public, anon, authenticated;
revoke all on function public.run_my_recurring() from public, anon;
grant execute on function public.run_my_recurring() to authenticated;

-- -----------------------------------------------------------------------------
-- Import: insert a batch of rows atomically and record the import
-- (runs with the caller's permissions, so row-level security still applies)
-- -----------------------------------------------------------------------------
create or replace function public.import_transactions(p_file_name text, p_rows jsonb, p_skipped int)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  imp uuid;
  n   int;
begin
  insert into public.imports (file_name, rows_skipped) values (p_file_name, p_skipped)
  returning id into imp;

  insert into public.transactions
    (txn_date, merchant, category_id, subcategory_id, expense_type, paid_by, split_type,
     personal_for, payment_method, amount, is_one_off, notes, import_id)
  select x.txn_date, x.merchant, x.category_id, x.subcategory_id, x.expense_type, x.paid_by,
         x.split_type, x.personal_for, x.payment_method, x.amount, coalesce(x.is_one_off, false),
         x.notes, imp
  from jsonb_to_recordset(p_rows) as x(
    txn_date date, merchant text, category_id uuid, subcategory_id uuid, expense_type text,
    paid_by uuid, split_type text, personal_for uuid, payment_method text, amount numeric,
    is_one_off boolean, notes text);

  get diagnostics n = row_count;
  update public.imports set rows_added = n where id = imp;
  return imp;
end $$;

grant execute on function public.import_transactions(text, jsonb, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Monthly totals per category (respects row-level security of the caller)
-- -----------------------------------------------------------------------------
create view public.monthly_category_totals
with (security_invoker = true) as
select
  household_id,
  date_trunc('month', txn_date)::date                  as month,
  category_id,
  sum(amount)                                          as total,
  coalesce(sum(amount) filter (where is_one_off), 0)   as one_off,
  count(*)                                             as txn_count
from public.transactions
where deleted_at is null
group by household_id, date_trunc('month', txn_date), category_id;

-- -----------------------------------------------------------------------------
-- Row-level security & grants for the new tables
-- -----------------------------------------------------------------------------
alter table public.imports         enable row level security;
alter table public.recurring_rules enable row level security;

create policy "members all imports" on public.imports
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members all recurring" on public.recurring_rules
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

revoke all on public.imports, public.recurring_rules, public.monthly_category_totals from anon;
grant select, insert, update         on public.imports                 to authenticated;
grant select, insert, update, delete on public.recurring_rules         to authenticated;
grant select                         on public.monthly_category_totals to authenticated;

-- -----------------------------------------------------------------------------
-- Daily job: create due recurring expenses at ~6am Melbourne time (19:00 UTC).
-- Uses Supabase's built-in pg_cron. If it can't be enabled here, the app still
-- catches up whenever someone opens it (run_my_recurring).
-- -----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'generate-recurring-expenses',
    '0 19 * * *',
    'select public.generate_recurring_transactions()'
  );
exception when others then
  raise notice 'pg_cron not available (%). Recurring expenses will be created when the app is opened.', sqlerrm;
end $$;
