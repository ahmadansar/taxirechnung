-- Kontoinhaber (account holder) as registered at the bank, used for GiroCode, pay page and PDFs.
-- Banks check the payee name against the IBAN (Verification of Payee), so it must match exactly.
alter table public.companies add column if not exists account_holder text not null default '';

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
