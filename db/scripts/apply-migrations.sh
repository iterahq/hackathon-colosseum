#!/usr/bin/env bash
# Apply Itera DB migrations to the Itera Supabase project (lightweight flow, ADR-F1).
# Reads connection from env:
#   ITERA_DB_URL  — full postgres URL (pooler), e.g.
#     postgresql://postgres.<ref>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
#   (password via PGPASSWORD or embedded in the URL)
# Runs every db/migrations/*.sql in lexical order, inside a single psql session.
# Idempotent — each migration is written to be safely re-runnable.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ITERA_DB_URL:?ITERA_DB_URL is required}"

echo "Applying Itera migrations from ${ROOT}/migrations …"
for f in "${ROOT}"/migrations/*.sql; do
  echo "  -> $(basename "$f")"
  psql "$ITERA_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Done. Tables:"
psql "$ITERA_DB_URL" -tAc "select tablename from pg_tables where schemaname='itera' order by 1"
