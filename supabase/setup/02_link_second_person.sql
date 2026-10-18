-- =============================================================================
-- Run this when the second person (Jo) has a login but wasn't linked during setup.
-- Replace both e-mail addresses, then Run in the SQL Editor.
-- =============================================================================

do $$
declare
  raja_email text := 'REPLACE_WITH_RAJA_EMAIL';
  jo_email   text := 'REPLACE_WITH_JO_EMAIL';
  hid    uuid;
  jo_uid uuid;
begin
  select m.household_id into hid
  from public.household_members m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(raja_email);
  if hid is null then raise exception 'Run 01_setup_household.sql first.'; end if;

  select id into jo_uid from auth.users where lower(email) = lower(jo_email);
  if jo_uid is null then raise exception 'No login found for %.', jo_email; end if;

  insert into public.household_members (household_id, user_id) values (hid, jo_uid)
  on conflict do nothing;
  update public.people set user_id = jo_uid where household_id = hid and name = 'Jo';
  raise notice 'Linked % to the household.', jo_email;
end $$;
