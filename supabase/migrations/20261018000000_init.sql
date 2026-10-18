-- =============================================================================
-- Couple Expense Tracker – initial schema
-- Run this once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Safe to read top-to-bottom: tables, integrity triggers, then row-level security.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- One household = one shared expense log (Raja & Jo).
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Which login accounts belong to which household (one household per login).
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

-- Returns the household of the signed-in user. Used as a column default so the
-- app never has to send household_id itself.
create or replace function public.current_household_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = auth.uid() limit 1
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  )
$$;

-- People who pay / share costs. Linked to a login when they have one.
create table public.people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
               references public.households(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  user_id      uuid unique references auth.users(id) on delete set null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.current_household_id()
                 references public.households(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  monthly_budget numeric(12,2) check (monthly_budget is null or monthly_budget >= 0),
  sort_order     int  not null default 0,
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (household_id, name)
);

create table public.subcategories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
               references public.households(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  sort_order   int  not null default 0,
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (category_id, name)
);

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.current_household_id()
                 references public.households(id) on delete cascade,
  txn_date       date not null,
  merchant       text not null check (length(trim(merchant)) > 0),
  category_id    uuid not null references public.categories(id),
  subcategory_id uuid references public.subcategories(id),
  expense_type   text not null check (expense_type in ('Fixed Needs', 'Variable Wants')),
  paid_by        uuid not null references public.people(id),
  -- 'shared' = split 50/50; 'personal' = belongs entirely to personal_for
  split_type     text not null default 'shared' check (split_type in ('shared', 'personal')),
  personal_for   uuid references public.people(id),
  payment_method text check (payment_method in ('Card', 'Cash', 'Bank Transfer', 'Other')),
  amount         numeric(12,2) not null check (amount <> 0),  -- negative = refund
  is_one_off     boolean not null default false,
  notes          text,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,                                  -- soft delete
  constraint split_person_consistent check (
    (split_type = 'shared'   and personal_for is null) or
    (split_type = 'personal' and personal_for is not null)
  )
);

create index transactions_household_date_idx
  on public.transactions (household_id, txn_date desc)
  where deleted_at is null;
create index transactions_category_idx on public.transactions (category_id);
create index subcategories_category_idx on public.subcategories (category_id);

-- -----------------------------------------------------------------------------
-- Integrity triggers: everything a row points at must be in the same household
-- -----------------------------------------------------------------------------

create or replace function public.check_subcategory_household()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.categories c
                 where c.id = new.category_id and c.household_id = new.household_id) then
    raise exception 'Category does not belong to this household';
  end if;
  return new;
end $$;

create trigger subcategories_household_check
  before insert or update on public.subcategories
  for each row execute function public.check_subcategory_household();

create or replace function public.check_transaction_refs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.categories c
                 where c.id = new.category_id and c.household_id = new.household_id) then
    raise exception 'Category does not belong to this household';
  end if;
  if new.subcategory_id is not null and not exists (
       select 1 from public.subcategories s
       where s.id = new.subcategory_id and s.category_id = new.category_id) then
    raise exception 'Sub-category does not belong to the chosen category';
  end if;
  if not exists (select 1 from public.people p
                 where p.id = new.paid_by and p.household_id = new.household_id) then
    raise exception 'Paid-by person does not belong to this household';
  end if;
  if new.personal_for is not null and not exists (
       select 1 from public.people p
       where p.id = new.personal_for and p.household_id = new.household_id) then
    raise exception 'Personal-for person does not belong to this household';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger transactions_refs_check
  before insert or update on public.transactions
  for each row execute function public.check_transaction_refs();

-- -----------------------------------------------------------------------------
-- Row-level security: you only ever see rows of your own household
-- -----------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.people            enable row level security;
alter table public.categories        enable row level security;
alter table public.subcategories     enable row level security;
alter table public.transactions      enable row level security;

create policy "members read household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members rename household" on public.households
  for update to authenticated using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "members read membership" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy "members read people" on public.people
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add people" on public.people
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members edit people" on public.people
  for update to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members all categories" on public.categories
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members all subcategories" on public.subcategories
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members all transactions" on public.transactions
  for all to authenticated using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Explicit grants (signed-in users only; anonymous visitors get nothing).
revoke all on public.households, public.household_members, public.people,
              public.categories, public.subcategories, public.transactions from anon;
grant select, update                 on public.households        to authenticated;
grant select                         on public.household_members to authenticated;
grant select, insert, update         on public.people            to authenticated;
grant select, insert, update, delete on public.categories        to authenticated;
grant select, insert, update, delete on public.subcategories     to authenticated;
grant select, insert, update, delete on public.transactions      to authenticated;
grant execute on function public.current_household_id()   to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
