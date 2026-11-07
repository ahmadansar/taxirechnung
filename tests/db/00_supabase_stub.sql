-- Minimal stand-in for the parts of Supabase that schema.sql uses (auth, storage, roles),
-- so the schema and its security rules can be tested on any plain PostgreSQL.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant all on storage.objects to authenticated, anon;

-- test helpers
create schema if not exists test;
create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create or replace function test.throws(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % (no error)', msg;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm !~* pattern then raise exception 'FAIL: % (wrong error: %)', msg, sqlerrm; end if;
  raise notice 'ok - % (%)', msg, sqlerrm;
end $$;
create or replace function test.login(uid uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false) $$;
grant usage on schema test to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;
