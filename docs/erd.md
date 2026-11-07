# Data model (ERD)

A taxi company is the **tenant**. Every row with customer or invoice data carries `company_id`,
and the database itself decides who may see it (Row Level Security), not the app.

```mermaid
erDiagram
    USER ||--o| COMPANY : "owns (owner_id, unique)"
    USER ||--o| COMPANY_MEMBER : "belongs to max. 1 company"
    COMPANY ||--|{ COMPANY_MEMBER : "team"
    COMPANY ||--o{ COMPANY_INVITE : "invite codes"
    COMPANY ||--o{ CUSTOMER : "customer database"
    COMPANY ||--o{ INVOICE : "issues"
    COMPANY ||--o{ COUNTER : "gap-free numbers"
    COMPANY ||--o| BANK_CONNECTION : "FinTS (optional)"
    CUSTOMER |o--o{ INVOICE : "billed to"
    INVOICE |o--o| INVOICE : "storno_of"
    USER |o--o{ INVOICE : "created_by"

    USER {
        uuid id PK "Supabase Auth"
        text email UK
    }
    COMPANY {
        uuid id PK "tenant id"
        uuid owner_id FK,UK
        text name
        text tax_number "or vat_id - one required"
        text iban
        text invoice_prefix
        text terms_version
    }
    COMPANY_MEMBER {
        uuid company_id PK,FK
        uuid user_id PK,FK "UK: one company per user"
        text role "owner | driver"
        text email
    }
    COMPANY_INVITE {
        text code PK "8 chars, single use, 7 days"
        uuid company_id FK
        uuid used_by FK
        timestamptz expires_at
    }
    CUSTOMER {
        uuid id PK
        uuid company_id FK "tenant boundary"
        text customer_number "K-0001 per company"
        text type "private | business"
        text company_name
        text name
    }
    INVOICE {
        uuid id PK
        uuid company_id FK "tenant boundary"
        text number "UK (company_id, number)"
        text kind "invoice | storno"
        date issue_date
        date due_date
        bool paid
        jsonb seller "frozen at issue (GoBD)"
        jsonb customer "frozen at issue"
        jsonb items
        jsonb totals
        text payment_token UK "public pay link"
        int reminder_count
        timestamptz archived_at
    }
    COUNTER {
        uuid company_id PK,FK
        text key PK "invoice:2026, customer"
        int value
    }
    BANK_CONNECTION {
        uuid company_id PK,FK
        text login_enc "AES-256-GCM"
        text pin_enc "AES-256-GCM"
        text status
    }
```

Rendered: [erd.svg](erd.svg)

## Tenant boundary

- Every table with business data has `company_id`. RLS policies only return rows where
  `is_member(company_id)` is true for the logged-in user (`auth.uid()` from the JWT).
- A wrong or guessed id from another company returns nothing, the same as if it did not exist.
- Settings, bank connection, cancellations and invite codes need `is_owner(company_id)`.
- Writes that must be atomic (invoice number + insert, storno + cancel original, joining with a code)
  are `security definer` functions that check membership/ownership first.
- Covered by `tests/db/10_security.test.sql` (owner, driver, stranger, second tenant, anonymous).

## Uniqueness rules

| Rule | Why |
|---|---|
| `invoices (company_id, number)` unique, numbers from `counters` per company and year | gap-free invoice numbers (GoBD) |
| `company_members.user_id` unique | one company per login, so the app never has to ask "which company?" |
| `companies.owner_id` unique | one company per owner account |
| `company_invites.code` primary key, single use, expires after 7 days | invite codes can't be reused or guessed for long |
| `invoices.payment_token` unique, 36 hex chars | the public pay page only works with the secret link |

## Auth flow

1. Login with email + password (Supabase Auth) → short-lived JWT + refresh token.
2. Every request to the database carries the JWT; Postgres reads `auth.uid()` from it.
3. RLS + the functions above check membership/role on every query, also for the Edge Function
   (`bank-sync` checks that the caller is the owner before touching the bank login).
