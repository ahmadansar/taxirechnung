-- TaxiRechnung – Supabase schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Multi-tenant: every taxi company only ever sees its own data (Row Level Security).
-- GoBD: invoices get gap-free sequential numbers inside one transaction, can never be
-- deleted, and their content can never be changed after issue (only paid/cancelled status).

create extension if not exists pgcrypto;

-- ───────────────────────── companies ─────────────────────────
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  owner_name text not null default '',
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  tax_number text not null default '',
  vat_id text not null default '',
  concession_number text not null default '',
  iban text not null default '',
  bic text not null default '',
  bank_name text not null default '',
  fints_product_id text not null default '',   -- FinTS product registration (automatic payment check)
  last_backup_at timestamptz,                   -- last full export (backup reminder)
  terms_accepted_at timestamptz,                -- acceptance of terms of use + AVV
  terms_version text not null default '',
  small_business boolean not null default false,
  invoice_prefix text not null default 'RE',
  payment_terms_days int not null default 14,
  default_city text not null default '',
  logo_data_url text not null default '',
  footer_note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.companies add column if not exists fints_product_id text not null default '';
alter table public.companies add column if not exists last_backup_at timestamptz;
alter table public.companies add column if not exists terms_accepted_at timestamptz;
alter table public.companies add column if not exists terms_version text not null default '';
alter table public.companies add column if not exists account_holder text not null default '';  -- Kontoinhaber as at the bank

-- members: the owner (created with the company) and drivers (joined with an invite code)
create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (company_id, user_id)
);
alter table public.company_members add column if not exists email text not null default '';
alter table public.company_members add column if not exists created_at timestamptz not null default now();
alter table public.company_members drop constraint if exists company_members_role_check;
update public.company_members set role = 'driver' where role not in ('owner','driver');
alter table public.company_members add constraint company_members_role_check check (role in ('owner','driver'));
update public.company_members m set email = u.email from auth.users u where m.user_id = u.id and m.email = '' and u.email is not null;
-- one company per user (the app shows exactly one company after login)
create unique index if not exists company_members_one_company on public.company_members(user_id);

create or replace function public.is_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = p_company and user_id = auth.uid());
$$;

create or replace function public.is_owner(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = p_company and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into company_members(company_id, user_id, role, email)
  values (new.id, new.owner_id, 'owner', coalesce((select email from auth.users where id = new.owner_id), ''))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_company_owner on public.companies;
create trigger trg_company_owner after insert on public.companies
  for each row execute function public.add_owner_membership();

-- ───────────────────────── counters ─────────────────────────
create table if not exists public.counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value int not null default 0,
  primary key (company_id, key)
);

create or replace function public.bump_counter(p_company uuid, p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into counters(company_id, key, value) values (p_company, p_key, 1)
  on conflict (company_id, key) do update set value = counters.value + 1
  returning value into n;
  return n;
end $$;
revoke all on function public.bump_counter(uuid, text) from public, anon, authenticated;

-- ───────────────────────── customers ─────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_number text not null default '',
  type text not null default 'private' check (type in ('private','business')),
  company_name text not null default '',
  name text not null default '',
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  email text not null default '',
  phone text not null default '',
  vat_id text not null default '',
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists customers_company_idx on public.customers(company_id);

create or replace function public.set_customer_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_number = '' then
    new.customer_number := 'K-' || lpad(bump_counter(new.company_id, 'customer')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_customer_number on public.customers;
create trigger trg_customer_number before insert on public.customers
  for each row execute function public.set_customer_number();

-- ───────────────────────── invoices ─────────────────────────
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  number text not null,
  kind text not null default 'invoice' check (kind in ('invoice','storno')),
  storno_of uuid references public.invoices(id),
  storno_of_number text,
  status text not null default 'issued' check (status in ('issued','cancelled')),
  issue_date date not null,
  due_date date,
  gross_cents bigint not null,
  payment_method text not null,
  paid boolean not null default false,
  paid_at date,
  reference text not null default '',
  notes text not null default '',
  customer jsonb,          -- frozen recipient data
  seller jsonb not null,   -- frozen company data at time of issue
  trip jsonb not null,
  items jsonb not null,
  totals jsonb not null,
  -- secret token for the customer's payment link (…/?pay=<token>)
  payment_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  paid_via text,           -- 'bank' when matched from a bank statement, 'manual' when ticked by hand
  created_at timestamptz not null default now(),
  unique (company_id, number)
);
alter table public.invoices add column if not exists payment_token text unique default encode(gen_random_bytes(18), 'hex');
alter table public.invoices add column if not exists paid_via text;
alter table public.invoices add column if not exists archived_at timestamptz;
alter table public.invoices add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists reminder_count int not null default 0;
alter table public.invoices add column if not exists last_reminder_at date;
create index if not exists invoices_company_idx on public.invoices(company_id, created_at desc);

-- GoBD: no deletes, no content changes after issue
create or replace function public.protect_invoice()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rechnungen dürfen nicht gelöscht werden (GoBD). Bitte stornieren.';
  end if;
  -- allowed to change: payment status, cancellation, customer link, archive note, reminders
  if (to_jsonb(new) - array['paid','paid_at','status','customer_id','paid_via','archived_at','reminder_count','last_reminder_at'])
     is distinct from (to_jsonb(old) - array['paid','paid_at','status','customer_id','paid_via','archived_at','reminder_count','last_reminder_at']) then
    raise exception 'Rechnungsinhalt ist unveränderbar (GoBD).';
  end if;
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'Archivierungsdatum ist unveränderbar (GoBD).';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Stornierte Rechnungen können nicht reaktiviert werden.';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_invoice on public.invoices;
create trigger trg_protect_invoice before update or delete on public.invoices
  for each row execute function public.protect_invoice();

-- Issue an invoice: assigns the next number for the year atomically and inserts it.
-- For kind = 'storno' it also marks the original invoice as cancelled (same transaction).
create or replace function public.issue_invoice(p jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  c companies;
  yr text := substr(p->>'issue_date', 1, 4);
  n int;
  num text;
  r invoices;
begin
  select * into c from companies where id = (p->>'company_id')::uuid;
  if c.id is null or not is_member(c.id) then
    raise exception 'forbidden';
  end if;

  if p->>'kind' = 'storno' then
    if not is_owner(c.id) then raise exception 'Nur der Inhaber kann stornieren.'; end if;
    update invoices set status = 'cancelled'
     where id = (p->>'storno_of')::uuid and company_id = c.id and status = 'issued' and kind = 'invoice';
    if not found then raise exception 'Rechnung kann nicht storniert werden.'; end if;
  end if;

  n := bump_counter(c.id, 'invoice:' || yr);
  num := case when c.invoice_prefix <> '' then c.invoice_prefix || '-' else '' end
         || yr || '-' || lpad(n::text, 4, '0');

  insert into invoices (id, company_id, customer_id, number, kind, storno_of, storno_of_number, status,
                        issue_date, due_date, gross_cents, payment_method, paid, paid_at, reference, notes,
                        customer, seller, trip, items, totals, created_by, created_at)
  values (coalesce((p->>'id')::uuid, gen_random_uuid()), c.id, nullif(p->>'customer_id','')::uuid, num,
          p->>'kind', nullif(p->>'storno_of','')::uuid, p->>'storno_of_number', 'issued',
          (p->>'issue_date')::date, nullif(p->>'due_date','')::date, (p->'totals'->>'gross')::bigint,
          p->>'payment_method', coalesce((p->>'paid')::boolean, false), nullif(p->>'paid_at','')::date,
          coalesce(p->>'reference',''), coalesce(p->>'notes',''),
          case when jsonb_typeof(p->'customer') = 'object' then p->'customer' else null end,
          to_jsonb(c) - array['fints_product_id','last_backup_at','terms_accepted_at','terms_version'],
          p->'trip', p->'items', p->'totals', auth.uid(), now())
  returning * into r;
  return r;
end $$;
grant execute on function public.issue_invoice(jsonb) to authenticated;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.counters enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select using (owner_id = auth.uid() or is_member(id));
drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert with check (owner_id = auth.uid());
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update using (is_owner(id)) with check (is_owner(id));

-- team: everyone sees the team of their company; only the owner can remove drivers
drop policy if exists members_select on public.company_members;
create policy members_select on public.company_members for select using (user_id = auth.uid() or is_member(company_id));
drop policy if exists members_delete on public.company_members;
create policy members_delete on public.company_members for delete using (is_owner(company_id) and role = 'driver');

drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers for all using (is_member(company_id)) with check (is_member(company_id));

-- invoices: read + status updates only; inserts go through issue_invoice(); deletes are blocked
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select using (is_member(company_id));
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update using (is_member(company_id)) with check (is_member(company_id));


-- ───────────────────────── Driver invites ─────────────────────────
-- The owner creates a short code; a driver registers, enters the code and joins the company.
create table if not exists public.company_invites (
  code text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null default 'driver' check (role = 'driver'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
alter table public.company_invites enable row level security;
drop policy if exists invites_select on public.company_invites;
create policy invites_select on public.company_invites for select using (is_owner(company_id));
drop policy if exists invites_delete on public.company_invites;
create policy invites_delete on public.company_invites for delete using (is_owner(company_id));

create or replace function public.create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare cid uuid; code text;
begin
  select company_id into cid from company_members where user_id = auth.uid() and role = 'owner';
  if cid is null then raise exception 'forbidden'; end if;
  -- 8 characters without look-alikes (0/O, 1/I)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
    into code from (select gen_random_bytes(8) b) x, generate_series(0, 7) i;
  insert into company_invites(code, company_id, created_by) values (code, cid, auth.uid());
  return code;
end $$;
revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv company_invites;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if exists (select 1 from company_members where user_id = auth.uid()) then
    raise exception 'Dieses Konto gehört bereits zu einem Unternehmen.';
  end if;
  select * into inv from company_invites
   where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'))
     and used_by is null and expires_at > now()
   for update;
  if inv.code is null then raise exception 'Einladungscode ungültig oder abgelaufen.'; end if;
  insert into company_members(company_id, user_id, role, email)
  values (inv.company_id, auth.uid(), inv.role, coalesce((select email from auth.users where id = auth.uid()), ''));
  update company_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.company_id;
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- ───────────────────────── Customer payment page ─────────────────────────
-- The link on each invoice (…/?pay=<token>) shows the customer the amount and your bank
-- details for a direct transfer. Only this limited summary is public, and only for the
-- holder of the secret 36-character token.
create or replace function public.public_invoice(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', i.number,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'amount_cents', i.gross_cents,
    'company', i.seller->>'name',
    'company_city', i.seller->>'city',
    'account_holder', coalesce(nullif(i.seller->>'account_holder', ''), i.seller->>'name'),
    'iban', i.seller->>'iban',
    'bic', i.seller->>'bic',
    'bank_name', i.seller->>'bank_name',
    'customer', coalesce(nullif(i.customer->>'company_name', ''), i.customer->>'name', ''),
    'paid', i.paid,
    'paid_at', i.paid_at,
    'cancelled', (i.status = 'cancelled' or i.kind = 'storno')
  )
  from invoices i
  where length(p_token) >= 32 and i.payment_token = p_token;
$$;
revoke all on function public.public_invoice(text) from public;
grant execute on function public.public_invoice(text) to anon, authenticated;

-- ───────────────────────── Automatic bank sync (FinTS) ─────────────────────────
-- The company's online-banking login is stored ENCRYPTED (AES-GCM, key only in the
-- Edge Function secret BANK_CRED_KEY). The app can read the status columns but never
-- the encrypted login; only the `bank-sync` Edge Function (service role) writes here.
create table if not exists public.bank_connections (
  company_id uuid primary key references public.companies(id) on delete cascade,
  bank_code text not null,            -- BLZ
  bank_name text not null default '',
  fints_url text not null,
  iban text not null,                 -- account that receives the payments
  login_enc text not null,            -- encrypted VR-NetKey / alias
  pin_enc text not null,              -- encrypted PIN
  tan_method_id int,
  tan_method_name text not null default '',
  tan_media text not null default '',
  banking_info jsonb,                 -- BPD/UPD + system id from the bank (no secrets)
  status text not null default 'ok' check (status in ('ok','needs_approval','error')),
  last_error text not null default '',
  last_sync_at timestamptz,
  last_matched int not null default 0,
  approved_at timestamptz,            -- last strong customer authentication (TAN approval)
  created_at timestamptz not null default now()
);
alter table public.bank_connections enable row level security;
revoke all on public.bank_connections from anon, authenticated;
grant select (company_id, bank_code, bank_name, iban, tan_method_name, status, last_error, last_sync_at, last_matched, approved_at, created_at)
  on public.bank_connections to authenticated;
drop policy if exists bank_connections_select on public.bank_connections;
create policy bank_connections_select on public.bank_connections for select using (is_owner(company_id));

-- ───────────────────────── GoBD archive (Supabase Storage) ─────────────────────────
-- Every issued invoice is stored once as PDF (+ XRechnung XML for business customers)
-- under <company_id>/<invoice number>.pdf. Members can add and read files of their company,
-- but there is NO update or delete policy: archived files can never be changed or removed.
do $$ begin
  insert into storage.buckets (id, name, public) values ('archive', 'archive', false) on conflict (id) do nothing;
exception when undefined_table then raise notice 'storage schema not available'; end $$;

do $$ begin
  drop policy if exists archive_read on storage.objects;
  create policy archive_read on storage.objects for select to authenticated
    using (bucket_id = 'archive' and (storage.foldername(name))[1] in (select company_id::text from public.company_members where user_id = auth.uid()));
  drop policy if exists archive_insert on storage.objects;
  create policy archive_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'archive' and (storage.foldername(name))[1] in (select company_id::text from public.company_members where user_id = auth.uid()));
exception when undefined_table or invalid_schema_name or undefined_function then raise notice 'storage schema not available'; end $$;

-- Let the app see "paid" flip live (optional; Supabase Realtime)
do $$ begin
  alter publication supabase_realtime add table public.invoices;
exception when others then null; end $$;
