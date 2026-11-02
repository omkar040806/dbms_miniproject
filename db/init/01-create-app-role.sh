#!/bin/bash
# Runs once, when the Postgres container starts with an empty data volume.
# Creates `app_user`, the least-privilege role the Next.js app connects as.
# Table privileges are granted later by migration 003_app_privileges.sql.
set -euo pipefail

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "APP_DB_PASSWORD is not set; refusing to create app_user without a password" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v app_password="$APP_DB_PASSWORD" \
     -v db_name="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE app_user LOGIN PASSWORD :'app_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE :"db_name" TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
EOSQL

echo "Created role app_user"
