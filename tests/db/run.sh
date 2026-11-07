#!/usr/bin/env bash
# Database tests on a throw-away PostgreSQL database:
#   1. supabase/schema.sql (all-in-one file for the SQL Editor) runs twice without errors
#   2. supabase/migrations/* applied in order give exactly the same database structure
#   3. security tests (tenant isolation, roles, GoBD) pass on both
# Usage:  DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres tests/db/run.sh
#         (with Docker: docker compose up -d db, then run this)
set -euo pipefail
cd "$(dirname "$0")/../.."
URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
A="taxi_test_schema_$$"; B="taxi_test_migr_$$"
q() { psql "$1" -q -v ON_ERROR_STOP=1 "${@:2}"; }
cleanup() { for d in $A $B; do psql "$URL" -qc "drop database if exists $d" >/dev/null 2>&1 || true; done; }
trap cleanup EXIT
db() { echo "${URL%/*}/$1"; }
run_file() { if ! out=$(q "$(db "$1")" -f "$2" 2>&1); then echo "$out"; echo "✗ $2 failed"; exit 1; fi; }

for d in $A $B; do psql "$URL" -qc "create database $d" >/dev/null; run_file $d tests/db/00_supabase_stub.sql; done

echo "▸ schema.sql (twice)"
run_file $A supabase/schema.sql
run_file $A supabase/schema.sql

echo "▸ migrations"
for f in supabase/migrations/*.sql; do echo "  $f"; run_file $B "$f"; done

echo "▸ schema.sql == migrations"
dump() { pg_dump --schema-only --no-owner --no-privileges -n public "$(db "$1")" | grep -v '^--' | grep -v '^$' | grep -v '^SET \|^SELECT pg_catalog\|^\\restrict\|^\\unrestrict' ; }
if ! diff <(dump $A) <(dump $B) >/tmp/schema_diff.txt; then echo "✗ structures differ:"; head -40 /tmp/schema_diff.txt; exit 1; fi
echo "  identical"

for d in $A $B; do
  echo "▸ security tests on $d"
  q "$(db $d)" -f tests/db/10_security.test.sql 2>&1 >/dev/null | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /  /'
  [ "${PIPESTATUS[0]}" = 0 ] || exit 1
done
