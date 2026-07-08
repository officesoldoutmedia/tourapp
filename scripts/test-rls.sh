#!/usr/bin/env bash
# Testele RLS pe un Postgres local "gol" cu stub de schema auth.
# Nu necesită Docker/Supabase — vezi docs/DECISIONS.md.
# Cerință: brew install postgresql@17
set -euo pipefail

export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="${TMPDIR:-/tmp}/tourapp-rls-pg"
PORT=54329
PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

cleanup() { pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ ! -d "$PGDATA" ]; then
  initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/log" start >/dev/null

dropdb -h /tmp -p "$PORT" -U postgres --if-exists tourapp_test
createdb -h /tmp -p "$PORT" -U postgres tourapp_test

"${PSQL[@]}" -d tourapp_test -f "$ROOT/supabase/tests/00000_auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -d tourapp_test -f "$f"
done
# Grant-urile pe care Supabase le face implicit pentru rolurile API:
"${PSQL[@]}" -d tourapp_test -c "
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated;"

for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "test: $(basename "$f")"
  "${PSQL[@]}" -d tourapp_test -f "$f"
done

echo "RLS TESTS: OK"
