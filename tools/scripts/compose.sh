#!/usr/bin/env bash
set -euo pipefail

[[ $# -ge 1 ]] || { printf 'Usage: %s <render|config|up|wait|seed|update|e2e|clear|reset|down|ps|logs> [services...]\n' "$0" >&2; exit 2; }
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
if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose version >/dev/null
  compose=(docker-compose)
else
  printf 'Docker Compose is required (install the Compose plugin or docker-compose).\n' >&2
  exit 1
fi
[[ -d "$deploy_dir/.venv" ]] || { printf 'Install deployment dependencies first: make -C deploy install\n' >&2; exit 1; }
[[ -f "$vars_file" ]] || vars_file="$tools_root/compose/local-vars.example.yml"
if [[ "$vars_file" == "$tools_root/compose/local-vars.yml" ]]; then
  chmod 600 "$vars_file"
fi

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
    "${compose[@]}" build api public admin
    "${compose[@]}" up -d mariadb api public admin
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
    "${compose[@]}" exec -T api python /opt/minnumst/seed_local_db.py seed
    ;;
  e2e)
    "${compose[@]}" exec -T -e MINNUMST_ALLOW_E2E=1 api python /opt/minnumst/e2e_api.py
    ;;
  clear|reset)
    printf 'This will %s the minnumst_local MariaDB data. Type "%s" to continue: ' "$action" "$action" >&2
    IFS= read -r confirmation
    [[ "$confirmation" == "$action" ]] || { printf 'Cancelled.\n' >&2; exit 1; }
    "${compose[@]}" exec -T -e MINNUMST_ALLOW_LOCAL_RESET=1 api python /opt/minnumst/seed_local_db.py "$action" --yes
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
