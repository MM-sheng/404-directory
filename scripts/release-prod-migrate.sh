#!/usr/bin/env bash
# One-shot production migration helper for v0.10.0+.
# Uses Neon owner credentials via neonctl (no URLs printed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${NEON_PROJECT_ID:-dry-tooth-17596838}"
unset NEON_API_KEY

if ! command -v neonctl >/dev/null 2>&1; then
  echo "neonctl is required" >&2
  exit 1
fi

OWNER_URL="$(
  neonctl connection-string \
    --project-id "$PROJECT_ID" \
    --role-name neondb_owner \
    --pooled false 2>/dev/null | tail -1
)"

if [[ -z "$OWNER_URL" || "$OWNER_URL" != postgresql://* ]]; then
  echo "Failed to resolve Neon owner connection string" >&2
  exit 1
fi

APP_URL="$(gcloud secrets versions access latest --secret=catalog-database-url)"

echo "==> Pre-check (owner)"
docker run --rm -e DATABASE_URL="$OWNER_URL" postgres:18-alpine \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT to_regclass('"'"'public.risk_evaluations'"'"') AS risk_table, to_regclass('"'"'public.prediction_market_evaluations'"'"') AS pm_table, to_regclass('"'"'public.verified_agent_admissions'"'"') AS verified_agent_table;"'

echo "==> Grant CREATE to app role"
docker run --rm -e DATABASE_URL="$OWNER_URL" postgres:18-alpine \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "GRANT CREATE ON SCHEMA public TO directory_404_app;"'

echo "==> Apply migrations (owner role)"
DATABASE_URL="$OWNER_URL" npm run db:migrate

echo "==> Post-check"
docker run --rm -e DATABASE_URL="$OWNER_URL" postgres:18-alpine \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT to_regclass('"'"'public.risk_evaluations'"'"') AS risk_table, to_regclass('"'"'public.prediction_market_evaluations'"'"') AS pm_table, to_regclass('"'"'public.verified_agent_admissions'"'"') AS verified_agent_table;" \
  -c "SELECT has_table_privilege('"'"'directory_404_app'"'"', '"'"'public.verified_agent_admissions'"'"', '"'"'SELECT'"'"') AS app_can_select, has_table_privilege('"'"'directory_404_app'"'"', '"'"'public.verified_agent_admissions'"'"', '"'"'INSERT'"'"') AS app_can_insert, has_table_privilege('"'"'directory_404_app'"'"', '"'"'public.verified_agent_admissions'"'"', '"'"'UPDATE'"'"') AS app_can_update;" \
  -c "SELECT count(*) AS migration_rows FROM drizzle.__drizzle_migrations;"'

echo "==> Revoke CREATE from app role"
docker run --rm -e DATABASE_URL="$OWNER_URL" postgres:18-alpine \
  sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "REVOKE CREATE ON SCHEMA public FROM directory_404_app;"'

echo "Migrations applied successfully."
