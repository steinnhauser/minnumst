#!/usr/bin/env bash
# Runs the app alone on this machine; see tools/compose/preview.yml.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
compose=(docker compose --file "$repo_root/tools/compose/preview.yml")
batch=${IMPORT_BATCH:-deploy/seed/wikidata-2026-11.jsonl}

case "${1:-}" in
  start)
    "${compose[@]}" up --build --detach --wait
    # Scripts go in on stdin: the images hold no tools and nothing is mounted.
    "${compose[@]}" exec -T api python - seed <"$repo_root/tools/scripts/seed_local_db.py"
    printf 'Archive: http://127.0.0.1:5173\nDesk:    http://127.0.0.1:5174\nAPI:     http://127.0.0.1:8000/docs\n'
    ;;
  load)
    [[ -f "$batch" ]] || { printf 'No %s: run make import fetch first.\n' "$batch" >&2; exit 1; }
    "${compose[@]}" exec -T api python -m minnumst_api.seed apply /dev/stdin <"$batch"
    ;;
  stop)
    "${compose[@]}" down
    ;;
  reset)
    "${compose[@]}" down --volumes
    ;;
  *)
    printf 'Usage: make preview start|load|stop|reset\n' >&2
    exit 2
    ;;
esac
