#!/usr/bin/env bash
# Runs the schema + import + row-level-security tests against a throwaway local
# Postgres database (Linux / WSL / macOS with Postgres 15+ installed).
#   ./supabase/tests/run_rls_test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
sed -e 's/REPLACE_WITH_RAJA_EMAIL/raja@example.com/; s/REPLACE_WITH_JO_EMAIL/jo@example.com/' \
  setup/01_setup_household.sql > /tmp/seed_for_test.sql
dropdb --if-exists cet_test && createdb cet_test
psql -d cet_test -v ON_ERROR_STOP=1 -f tests/rls_test.sql
