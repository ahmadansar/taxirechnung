-- Driver accounts (owner/driver roles + invite codes), payment reminders, owner-only settings.
-- Applied on top of 20261031000000_initial.sql. Safe to run more than once.

-- ── roles ──
alter table public.company_members add column if not exists email text not null default '';
alter table public.company_members add column if not exists created_at timestamptz not null default now();
alter table public.company_members drop constraint if exists company_members_role_check;
update public.company_members set role = 'driver' where role not in ('owner','driver');
alter table public.company_members add constraint company_members_role_check check (role in ('owner','driver'));
update public.company_members m set email = u.email from auth.users u where m.user_id = u.id and m.email = '' and u.email is not null;
-- one company per user (the app shows exactly one company after login)
create unique index if not exists company_members_one_company on public.company_members(user_id);

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

-- ── invoices: who issued it, reminders ──
alter table public.invoices add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists reminder_count int not null default 0;
alter table public.invoices add column if not exists last_reminder_at date;

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

-- ── owner-only settings, team visibility ──
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update using (is_owner(id)) with check (is_owner(id));

-- team: everyone sees the team of their company; only the owner can remove drivers
drop policy if exists members_select on public.company_members;
create policy members_select on public.company_members for select using (user_id = auth.uid() or is_member(company_id));
drop policy if exists members_delete on public.company_members;
create policy members_delete on public.company_members for delete using (is_owner(company_id) and role = 'driver');

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

drop policy if exists bank_connections_select on public.bank_connections;
create policy bank_connections_select on public.bank_connections for select using (is_owner(company_id));
