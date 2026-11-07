-- Security tests: tenant isolation, roles, GoBD rules. Every line must pass.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
grant all on all tables in schema public to authenticated;

insert into auth.users values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@test'),
  ('a0000000-0000-0000-0000-000000000002', 'driver-a@test'),
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@test'),
  ('c0000000-0000-0000-0000-000000000001', 'stranger@test')
on conflict do nothing;

set role authenticated;

-- ── owner A creates a company, a customer and invoices ──
select test.login('a0000000-0000-0000-0000-000000000001');
insert into companies(name, invoice_prefix, tax_number, iban) values ('Taxi A', 'RE', '1/2/3', 'DE89370400440532013000');
select id as a_id from companies \gset
update companies set account_holder = 'Ahmed Sumbul GbR' where id = :'a_id';
select test.ok((select role from company_members where user_id = auth.uid()) = 'owner', 'creator becomes owner');
insert into customers(company_id, name) values (:'a_id', 'Hotel Krone');
select test.ok((select customer_number from customers limit 1) = 'K-0001', 'customer numbers are assigned');

select id as inv1 from issue_invoice(jsonb_build_object('company_id', :'a_id', 'kind', 'invoice', 'issue_date', '2026-11-02',
  'payment_method', 'transfer', 'trip', '{}'::jsonb, 'items', '[]'::jsonb, 'totals', '{"gross": 2350}'::jsonb)) \gset
select test.ok((select number from invoices where id = :'inv1') = 'RE-2026-0001', 'first invoice number RE-2026-0001');
select test.ok((select created_by from invoices where id = :'inv1') = auth.uid(), 'created_by is recorded');
select test.ok(not ((select seller from invoices where id = :'inv1') ? 'fints_product_id'), 'internal fields are not frozen into the invoice');

-- GoBD
select test.throws($$update invoices set gross_cents = 1$$, 'unveränderbar', 'invoice content cannot change');
delete from invoices;
select test.ok((select count(*) from invoices) = 1, 'invoices cannot be deleted (no delete rule + GoBD trigger)');
update invoices set paid = true, paid_at = '2026-11-02', paid_via = 'manual' where id = :'inv1';
update invoices set reminder_count = 1, last_reminder_at = '2026-11-02' where id = :'inv1';
select test.ok((select paid and reminder_count = 1 from invoices where id = :'inv1'), 'payment status and reminders may change');
update invoices set paid = false, paid_at = null where id = :'inv1';

-- ── owner A invites a driver ──
select create_invite() as code \gset
select test.ok(:'code' ~ '^[A-HJ-NP-Z2-9]{8}$', 'invite code has 8 readable characters');

-- ── stranger cannot see anything ──
select test.login('c0000000-0000-0000-0000-000000000001');
select test.ok((select count(*) from invoices) = 0, 'stranger sees no invoices');
select test.ok((select count(*) from company_invites) = 0, 'stranger cannot read invite codes');
select test.throws($$select create_invite()$$, 'forbidden', 'stranger cannot create invites');
select test.throws($$select accept_invite('WRONGCOD')$$, 'ungültig', 'wrong code is rejected');

-- ── driver joins with the code ──
select test.login('a0000000-0000-0000-0000-000000000002');
select test.ok(accept_invite(lower(substr(:'code', 1, 4) || '-' || substr(:'code', 5))) = :'a_id', 'driver joins (code case and dash ignored)');
select test.ok((select role from company_members where user_id = auth.uid()) = 'driver', 'joined as driver');
select test.ok((select count(*) from invoices) = 1, 'driver sees company invoices');
select test.ok((select count(*) from company_members) = 2, 'driver sees the team');
select test.ok((select count(*) from company_invites) = 0, 'driver cannot read invite codes');
select test.throws($$select accept_invite('ABCDEFGH')$$, 'bereits', 'cannot join a second company');
select test.throws($$select create_invite()$$, 'forbidden', 'driver cannot create invites');

-- driver can work: customers, invoices, mark paid
insert into customers(company_id, name) values (:'a_id', 'Fahrgast Müller');
select id as inv2 from issue_invoice(jsonb_build_object('company_id', :'a_id', 'kind', 'invoice', 'issue_date', '2026-11-02',
  'payment_method', 'cash', 'trip', '{}'::jsonb, 'items', '[]'::jsonb, 'totals', '{"gross": 1200}'::jsonb)) \gset
select test.ok((select number from invoices where id = :'inv2') = 'RE-2026-0002', 'driver issues invoice with next number');
update invoices set paid = true where id = :'inv2';
select test.ok((select paid from invoices where id = :'inv2'), 'driver can mark paid');

-- driver cannot change company settings, cancel invoices, or see the bank connection
update companies set iban = 'DE00HACK' where id = :'a_id';
select test.ok((select iban from companies where id = :'a_id') = 'DE89370400440532013000', 'driver cannot change company data');
select test.throws(format($$select issue_invoice(jsonb_build_object('company_id', %L, 'kind', 'storno', 'storno_of', %L,
  'issue_date', '2026-11-02', 'payment_method', 'cash', 'trip', '{}'::jsonb, 'items', '[]'::jsonb, 'totals', '{"gross": -2350}'::jsonb))$$, :'a_id', :'inv1'),
  'Inhaber', 'driver cannot cancel invoices');
delete from company_members where user_id = 'a0000000-0000-0000-0000-000000000001';
select test.ok((select count(*) from company_members) = 2, 'driver cannot remove the owner');

-- ── used code cannot be reused ──
select test.login('b0000000-0000-0000-0000-000000000001');
select test.throws(format($$select accept_invite(%L)$$, :'code'), 'ungültig', 'used invite code cannot be reused');

-- ── tenant B ──
insert into companies(name, invoice_prefix, tax_number) values ('Taxi B', 'TB', '9/9/9');
select test.ok((select count(*) from companies) = 1, 'tenant B sees only its own company');
select test.ok((select count(*) from invoices) = 0, 'tenant B sees no invoices of A');
select test.ok((select count(*) from customers) = 0, 'tenant B sees no customers of A');
select test.ok((select count(*) from company_members) = 1, 'tenant B sees only its own team');
select test.throws(format($$select issue_invoice(jsonb_build_object('company_id', %L, 'kind', 'invoice', 'issue_date', '2026-11-02',
  'payment_method', 'cash', 'trip', '{}'::jsonb, 'items', '[]'::jsonb, 'totals', '{"gross": 1}'::jsonb))$$, :'a_id'), 'forbidden', 'tenant B cannot issue invoices for A');
update invoices set paid = false where company_id = :'a_id';
select test.throws(format($$insert into customers(company_id, name) values (%L, 'Spion')$$, :'a_id'), 'row-level security', 'tenant B cannot insert customers into A');
select test.throws(format($$insert into storage.objects(bucket_id, name) values ('archive', %L)$$, :'a_id' || '/RE-2026-0001.pdf'), 'row-level security', 'tenant B cannot write into A''s archive');

-- ── owner A: storno, remove driver ──
select test.login('a0000000-0000-0000-0000-000000000001');
select test.ok((select paid from invoices where id = :'inv2'), 'tenant B could not change A''s invoices');
select number as storno_no from issue_invoice(jsonb_build_object('company_id', :'a_id', 'kind', 'storno', 'storno_of', :'inv1', 'storno_of_number', 'RE-2026-0001',
  'issue_date', '2026-11-02', 'payment_method', 'transfer', 'trip', '{}'::jsonb, 'items', '[]'::jsonb, 'totals', '{"gross": -2350}'::jsonb)) \gset
select test.ok((select status from invoices where id = :'inv1') = 'cancelled', 'owner can cancel (storno ' || :'storno_no' || ')');
select test.throws($$update invoices set status = 'issued' where status = 'cancelled'$$, 'reaktiviert', 'cancelled invoice stays cancelled');
insert into storage.objects(bucket_id, name) values ('archive', :'a_id' || '/RE-2026-0001.pdf');
select test.ok((select count(*) from storage.objects) = 1, 'owner can archive into own folder');
delete from company_members where user_id = 'a0000000-0000-0000-0000-000000000002';
select test.ok((select count(*) from company_members) = 1, 'owner can remove the driver');
select test.login('a0000000-0000-0000-0000-000000000002');
select test.ok((select count(*) from invoices) = 0, 'removed driver loses access');

-- ── anonymous: only the public pay page ──
reset role;
set role anon;
select test.login(null);
select test.ok((select count(*) from invoices) = 0, 'anon sees no invoices');
reset role;
select payment_token as tok from invoices where id = :'inv2' \gset
set role anon;
select test.ok((public_invoice(:'tok')->>'number') = 'RE-2026-0002', 'pay page works with the secret token');
select test.ok((public_invoice(:'tok')->>'account_holder') = 'Ahmed Sumbul GbR', 'pay page shows the account holder name');
select test.ok(public_invoice('short') is null, 'pay page needs the full token');
reset role;
select test.ok(true, 'ALL DATABASE TESTS PASSED');
