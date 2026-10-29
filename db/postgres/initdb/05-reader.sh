#!/usr/bin/env bash
# The application connects as analytics_reader. That role can read the analytics views and nothing
# else: no access to dw, so names, e-mail addresses and salaries are out of reach even for a
# compromised backend.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v reader_password="$ANALYTICS_READER_PASSWORD" <<'SQL'
CREATE ROLE analytics_reader LOGIN PASSWORD :'reader_password';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA analytics TO analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO analytics_reader;
SQL
