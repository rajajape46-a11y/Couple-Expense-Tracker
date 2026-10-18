-- =============================================================================
-- One-time setup: creates your household, links both logins, loads the
-- categories and imports the 56 transactions from "Monthly expense log v2.xlsx".
--
-- BEFORE running:
--   1. Run supabase/migrations/20261018000000_init.sql first.
--   2. Create both logins in Supabase → Authentication → Users → "Add user".
--      (If Jo's login doesn't exist yet, that's fine – link it later with
--      02_link_second_person.sql.)
--   3. Replace the two e-mail addresses below with the real ones.
-- Then paste this whole file into the SQL Editor and click Run.
-- =============================================================================

do $$
declare
  raja_email text := 'REPLACE_WITH_RAJA_EMAIL';
  jo_email   text := 'REPLACE_WITH_JO_EMAIL';
  hid        uuid;
  raja_uid   uuid;
  jo_uid     uuid;
  p_raja     uuid;
  p_jo       uuid;
  imported   int;
begin
  select id into raja_uid from auth.users where lower(email) = lower(raja_email);
  if raja_uid is null then
    raise exception 'No login found for %. Create it in Authentication → Users first.', raja_email;
  end if;
  select id into jo_uid from auth.users where lower(email) = lower(jo_email);

  if exists (select 1 from public.household_members where user_id = raja_uid) then
    raise exception 'This login already belongs to a household – setup has already been run.';
  end if;

  insert into public.households (name) values ('Raja & Jo') returning id into hid;

  insert into public.household_members (household_id, user_id) values (hid, raja_uid);
  if jo_uid is not null then
    insert into public.household_members (household_id, user_id) values (hid, jo_uid);
  else
    raise notice 'No login found for % yet – run 02_link_second_person.sql once it exists.', jo_email;
  end if;

  insert into public.people (household_id, name, user_id, sort_order)
    values (hid, 'Raja', raja_uid, 1) returning id into p_raja;
  insert into public.people (household_id, name, user_id, sort_order)
    values (hid, 'Jo', jo_uid, 2) returning id into p_jo;

  insert into public.categories (household_id, name, sort_order)
  select hid, v.name, v.ord from (values
    ('Food & Groceries', 1),
    ('Housing & Rent', 2),
    ('Utilities & Phone', 3),
    ('Transport', 4),
    ('Health & Insurance', 5),
    ('Education', 6),
    ('Shopping', 7),
    ('Lifestyle & Entertainment', 8),
    ('Personal', 9),
    ('Travel', 10),
    ('Other', 11)
  ) as v(name, ord);

  insert into public.subcategories (household_id, category_id, name, sort_order)
  select hid, c.id, v.sub, v.ord
  from (values
    ('Food & Groceries', 'Supermarket & Groceries', 1),
    ('Food & Groceries', 'Takeaway & Coffee', 2),
    ('Food & Groceries', 'Dining Out & Date Nights', 3),
    ('Food & Groceries', 'Alcohol & Liquor', 4),
    ('Housing & Rent', 'Rent', 1),
    ('Housing & Rent', 'Bond & Rental Fees', 2),
    ('Housing & Rent', 'Household Supplies', 3),
    ('Housing & Rent', 'Furniture & Appliances', 4),
    ('Housing & Rent', 'Repairs & Maintenance', 5),
    ('Utilities & Phone', 'Electricity & Gas', 1),
    ('Utilities & Phone', 'Water', 2),
    ('Utilities & Phone', 'Home Internet', 3),
    ('Utilities & Phone', 'Mobile Plan', 4),
    ('Transport', 'Public Transport (Myki)', 1),
    ('Transport', 'Rideshare & Taxi', 2),
    ('Transport', 'Fuel', 3),
    ('Transport', 'Car Costs & Rego', 4),
    ('Transport', 'Parking & Tolls', 5),
    ('Health & Insurance', 'Health Insurance', 1),
    ('Health & Insurance', 'Doctor & Pharmacy', 2),
    ('Health & Insurance', 'Dental & Optical', 3),
    ('Health & Insurance', 'Fitness & Wellbeing', 4),
    ('Education', 'Course Fees', 1),
    ('Education', 'Books & Supplies', 2),
    ('Shopping', 'Clothing & Accessories', 1),
    ('Shopping', 'Electronics', 2),
    ('Shopping', 'Gifts', 3),
    ('Shopping', 'Online & Marketplace', 4),
    ('Lifestyle & Entertainment', 'Movies, Events & Hobbies', 1),
    ('Lifestyle & Entertainment', 'Subscriptions', 2),
    ('Lifestyle & Entertainment', 'Sightseeing & Outings', 3),
    ('Personal', 'Personal Allowance', 1),
    ('Personal', 'Haircut & Grooming', 2),
    ('Travel', 'Flights', 1),
    ('Travel', 'Accommodation', 2),
    ('Travel', 'Holidays & Trips', 3),
    ('Other', 'Miscellaneous', 1),
    ('Other', 'Money Sent Home', 2),
    ('Other', 'Fees & Charges', 3)
  ) as v(cat, sub, ord)
  join public.categories c on c.household_id = hid and c.name = v.cat;

  insert into public.transactions
    (household_id, txn_date, merchant, category_id, subcategory_id, expense_type,
     paid_by, split_type, personal_for, payment_method, amount, is_one_off, notes, created_by)
  select hid, v.d::date, v.merchant, c.id, s.id, v.expense_type,
         case v.paid_by when 'Raja' then p_raja else p_jo end,
         case v.split when 'Shared (50/50)' then 'shared' else 'personal' end,
         case v.split when 'Raja only' then p_raja when 'Jo only' then p_jo end,
         v.payment, v.amount, v.one_off, v.notes, raja_uid
  from (values
    ('2026-09-20', 'Airport Cab', 'Transport', 'Rideshare & Taxi', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 38.8, false, null),
    ('2026-09-21', 'Bupa Insurance', 'Health & Insurance', 'Health Insurance', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 217.69, false, null),
    ('2026-09-22', 'Indian Store', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 26.95, false, null),
    ('2026-09-22', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 51.37, false, null),
    ('2026-09-23', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 7.65, false, null),
    ('2026-09-23', 'TPG Mobile plan', 'Utilities & Phone', 'Mobile Plan', 'Fixed Needs', 'Raja', 'Jo only', null, 15, false, null),
    ('2026-09-24', 'Sri Murugan Hotel', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Raja only', null, 5.5, false, null),
    ('2026-09-24', 'Sri Murugan Hotel', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 4.99, false, null),
    ('2026-09-25', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-09-25', 'Kmart', 'Housing & Rent', 'Household Supplies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 0.15, false, null),
    ('2026-09-25', 'Jumbo Kebabs', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 16, false, null),
    ('2026-09-28', 'Queen Vic Market', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 29.39, false, null),
    ('2026-09-28', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 29.6, false, null),
    ('2026-09-28', 'Kmart', 'Housing & Rent', 'Household Supplies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 8.5, false, null),
    ('2026-09-28', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 21, false, null),
    ('2026-09-28', 'CBD College', 'Education', 'Course Fees', 'Variable Wants', 'Raja', 'Jo only', null, 95, false, null),
    ('2026-09-28', 'OZ Tibet Hotel', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 23, false, null),
    ('2026-09-30', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 9.6, false, null),
    ('2026-10-02', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 32.53, false, null),
    ('2026-10-02', 'Indian Store', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 2.53, false, null),
    ('2026-10-02', 'Hungry Jacks', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Raja only', null, 4, false, null),
    ('2026-10-02', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-03', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-04', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 16.35, false, null),
    ('2026-10-04', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-05', 'Jumbo Kebabs', 'Food & Groceries', 'Takeaway & Coffee', 'Variable Wants', 'Jo', 'Shared (50/50)', null, 16, false, null),
    ('2026-10-06', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 5.8, false, null),
    ('2026-10-06', 'Jumbo Kebabs', 'Food & Groceries', 'Takeaway & Coffee', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 15, false, null),
    ('2026-10-07', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-07', 'Hoyts', 'Lifestyle & Entertainment', 'Movies, Events & Hobbies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 24, false, null),
    ('2026-10-08', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 22.28, false, null),
    ('2026-10-08', 'Indian Store', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 41.14, false, null),
    ('2026-10-08', 'Kmart', 'Housing & Rent', 'Household Supplies', 'Variable Wants', 'Jo', 'Shared (50/50)', null, 35, false, null),
    ('2026-10-08', 'Don Don', 'Food & Groceries', 'Takeaway & Coffee', 'Variable Wants', 'Jo', 'Shared (50/50)', null, 14.6, false, null),
    ('2026-10-08', 'Hoyts', 'Lifestyle & Entertainment', 'Movies, Events & Hobbies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 3.6, false, null),
    ('2026-10-08', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-08', 'Coffee', 'Food & Groceries', 'Takeaway & Coffee', 'Variable Wants', 'Raja', 'Raja only', null, 4.5, false, null),
    ('2026-10-09', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-10', 'Brunetti', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Jo', 'Shared (50/50)', null, 11.6, false, null),
    ('2026-10-11', 'Kumar''s Indian Kitchen', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Jo', 'Shared (50/50)', null, 32.8, false, null),
    ('2026-10-11', 'Melbourne Star', 'Lifestyle & Entertainment', 'Movies, Events & Hobbies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 10, false, null),
    ('2026-10-11', 'Queen Vic Market Cash', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', 'Cash', 30, false, null),
    ('2026-10-12', 'Araya Hair Salon', 'Personal', 'Haircut & Grooming', 'Variable Wants', 'Raja', 'Raja only', null, 25, false, null),
    ('2026-10-12', 'October Rent', 'Housing & Rent', 'Rent', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 2595, false, null),
    ('2026-10-14', 'Chemist Warehouse', 'Health & Insurance', 'Doctor & Pharmacy', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 50.45, false, null),
    ('2026-10-14', 'EzyMart', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 6.7, false, null),
    ('2026-10-14', 'Myki Top Up', 'Transport', 'Public Transport (Myki)', 'Fixed Needs', 'Raja', 'Raja only', null, 5.7, false, null),
    ('2026-10-14', 'IHNA', 'Education', 'Course Fees', 'Variable Wants', 'Raja', 'Jo only', null, 2250, true, 'Course fee - marked one-off'),
    ('2026-10-15', 'Rent & Bond', 'Housing & Rent', 'Bond & Rental Fees', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 4866, true, 'Rent + bond paid together - marked one-off'),
    ('2026-10-15', 'EzyMart', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Raja', 'Shared (50/50)', null, 4.5, false, null),
    ('2026-10-16', 'Coles Supermarket', 'Food & Groceries', 'Supermarket & Groceries', 'Fixed Needs', 'Jo', 'Shared (50/50)', null, 28.93, false, null),
    ('2026-10-16', 'TPG Mobile plan', 'Utilities & Phone', 'Mobile Plan', 'Fixed Needs', 'Jo', 'Jo only', null, 15, false, null),
    ('2026-10-16', 'LiquorLand', 'Food & Groceries', 'Alcohol & Liquor', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 10, false, null),
    ('2026-10-17', 'Shein', 'Shopping', 'Clothing & Accessories', 'Variable Wants', 'Jo', 'Jo only', null, 27.41, false, null),
    ('2026-10-17', 'Marketplace Items', 'Housing & Rent', 'Household Supplies', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 14, false, null),
    ('2026-10-17', 'Number12 Thai', 'Food & Groceries', 'Dining Out & Date Nights', 'Variable Wants', 'Raja', 'Shared (50/50)', null, 30.58, false, null)
  ) as v(d, merchant, cat, sub, expense_type, paid_by, split, payment, amount, one_off, notes)
  join public.categories    c on c.household_id = hid and c.name = v.cat
  join public.subcategories s on s.category_id = c.id and s.name = v.sub;

  get diagnostics imported = row_count;
  if imported <> 56 then
    raise exception 'Expected 56 transactions but matched %. Nothing was saved.', imported;
  end if;
  raise notice 'Done: household created and % transactions imported.', imported;
end $$;
