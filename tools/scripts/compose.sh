#!/usr/bin/env bash
set -euo pipefail

[[ $# -ge 1 ]] || { printf 'Usage: %s <render|config|up|wait|seed|update|e2e|contract-cleanup|edge|backup-test|clear|reset|down|ps|logs> [services...]\n' "$0" >&2; exit 2; }
action=$1
shift
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
tools_root="$repo_root/tools"
deploy_dir="$repo_root/deploy"
playbook="$tools_root/compose/render.yml"
local_dir="$tools_root/compose/.local"
compose_file="$local_dir/compose.yml"
override_file="$tools_root/compose/local.override.yml"
vars_file="${LOCAL_COMPOSE_VARS:-$tools_root/compose/local-vars.yml}"

for required_tool in docker uv; do
  command -v "$required_tool" >/dev/null 2>&1 || { printf 'Required command not found: %s\n' "$required_tool" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { printf 'Docker Compose v2 (docker compose) is required.\n' >&2; exit 1; }
compose=(docker compose)
[[ -d "$repo_root/.venv" ]] || { printf 'Install dependencies first: make install\n' >&2; exit 1; }
[[ -f "$vars_file" ]] || vars_file="$tools_root/compose/local-vars.example.yml"
if [[ "$vars_file" == "$tools_root/compose/local-vars.yml" ]]; then
  chmod 600 "$vars_file"
fi

# Runs a PostgreSQL client command in the postgres container, as the superuser.
# It runs there, where the superuser password is set.
in_postgres() {
  # shellcheck disable=SC2016
  "${compose[@]}" exec -T -e PGUSER=postgres postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD"; export PGPASSWORD; '"$1"
}

# Reads a top-level value from the local variables file.
var() { awk -v key="$1:" '$1 == key { print $2 }' "$vars_file"; }

mkdir -p "$local_dir"
chmod 700 "$local_dir"
(
  cd "$deploy_dir"
  uv run ansible-playbook -i 'localhost,' -c local "$playbook" --extra-vars "@$vars_file"
)

compose+=(--project-name minnumst-local --file "$compose_file" --file "$override_file")
"${compose[@]}" config --quiet

case "$action" in
  render)
    printf 'Rendered local Compose file: %s\n' "$compose_file"
    ;;
  config)
    printf 'Compose configuration is valid. Rendered file: %s\n' "$compose_file"
    ;;
  up)
    # CI builds the images beforehand with a layer cache (STACK_PREBUILT=1).
    [[ ${STACK_PREBUILT:-} == 1 ]] || "${compose[@]}" build api public admin
    "${compose[@]}" up -d
    ;;
  wait)
    timeout=${WAIT_TIMEOUT:-120}
    deadline=$((SECONDS + timeout))
    until "${compose[@]}" exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz', timeout=2)" >/dev/null 2>&1 \
      && "${compose[@]}" exec -T public wget -q -O /dev/null http://127.0.0.1:8080/runtime-config.js >/dev/null 2>&1 \
      && "${compose[@]}" exec -T admin wget -q -O /dev/null http://127.0.0.1:8080/runtime-config.js >/dev/null 2>&1; do
      if ((SECONDS >= deadline)); then
        printf 'The stack was not ready after %s seconds.\n' "$timeout" >&2
        "${compose[@]}" ps >&2
        "${compose[@]}" logs --tail 50 api public admin >&2
        exit 1
      fi
      sleep 2
    done
    printf 'The API is ready and both frontends are serving.\n'
    ;;
  seed|update)
    "${compose[@]}" run --rm --no-deps migrate python /opt/minnumst/seed_local_db.py seed
    ;;
  e2e)
    "${compose[@]}" run --rm --no-deps -e MINNUMST_ALLOW_E2E=1 -e MINNUMST_E2E_API_URL=http://api:8000 \
      migrate python /opt/minnumst/e2e_api.py
    ;;
  contract-cleanup)
    "${compose[@]}" run --rm --no-deps -e MINNUMST_ALLOW_E2E=1 migrate python /opt/minnumst/e2e_api.py cleanup-contract
    ;;
  edge)
    WEB_HOST=$(var minnumst_domain) ADMIN_HOST=$(var minnumst_admin_domain) API_HOST=$(var minnumst_api_domain) \
      BASE_COMPOSE_FILE="$compose_file" bash "$tools_root/scripts/e2e_edge.sh"
    ;;
  backup-test)
    # The production backup (pg_dump, custom format) restored into a scratch
    # database must hold the same data as the original.
    dump="$local_dir/backup-test.dump"
    counts='SELECT (SELECT count(*) FROM people), (SELECT count(*) FROM blog_revisions)'
    in_postgres "pg_dump --format custom $(var postgres_database)" > "$dump"
    in_postgres 'dropdb --if-exists restore_check && createdb restore_check'
    in_postgres 'pg_restore --dbname restore_check --exit-on-error' < "$dump"
    original=$(in_postgres "psql --dbname $(var postgres_database) --tuples-only --no-align --command '$counts'")
    restored=$(in_postgres "psql --dbname restore_check --tuples-only --no-align --command '$counts'")
    rm -f "$dump"
    [[ -n $original && $original == "$restored" ]] || { printf 'FAIL backup restore: %s before, %s after\n' "$original" "$restored" >&2; exit 1; }
    printf 'PASS a pg_dump backup restores into a fresh database with the same data (people|revisions %s)\n' "$original"
    ;;
  clear|reset)
    printf 'This will %s the minnumst_local PostgreSQL data. Type "%s" to continue: ' "$action" "$action" >&2
    IFS= read -r confirmation
    [[ "$confirmation" == "$action" ]] || { printf 'Cancelled.\n' >&2; exit 1; }
    "${compose[@]}" run --rm --no-deps -e MINNUMST_ALLOW_LOCAL_RESET=1 migrate python /opt/minnumst/seed_local_db.py "$action" --yes
    ;;
  down)
    "${compose[@]}" down
    ;;
  ps)
    "${compose[@]}" ps
    ;;
  logs)
    "${compose[@]}" logs --tail 100 --follow "$@"
    ;;
  *)
    printf 'Unknown action: %s\n' "$action" >&2
    exit 2
    ;;
esac
