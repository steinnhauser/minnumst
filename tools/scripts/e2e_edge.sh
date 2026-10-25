#!/usr/bin/env bash
# End-to-end checks of the network edge, run by `make edge` against the local
# stack: requests go through Traefik exactly as a browser's would, and the
# rendered production Compose file is checked for network isolation.
set -euo pipefail

: "${WEB_HOST:?}" "${ADMIN_HOST:?}" "${API_HOST:?}" "${BASE_COMPOSE_FILE:?}"
http_port=8088
https_port=8443
token="Authorization: Bearer local-edge-test"
web="https://$WEB_HOST:$https_port"
admin="https://$ADMIN_HOST:$https_port"
api="https://$API_HOST:$https_port"
# Resolve the three hosts to loopback. Traefik serves its self-signed default
# certificate locally (there is no ACME), hence --insecure.
curl_args=(--silent --show-error --insecure --max-time 10)
for host in "$WEB_HOST" "$ADMIN_HOST" "$API_HOST"; do
  curl_args+=(--resolve "$host:$https_port:127.0.0.1" --resolve "$host:$http_port:127.0.0.1")
done

status() { curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' "$@"; }
check() { # <description> <expected glob> <actual>
  # shellcheck disable=SC2053 # $2 is a glob on purpose.
  if [[ "$3" == $2 ]]; then
    printf 'PASS %s\n' "$1"
  else
    printf 'FAIL %s: expected %s, got %s\n' "$1" "$2" "$3" >&2
    exit 1
  fi
}

# Network isolation, from the production template as rendered (no local override).
docker compose --file "$BASE_COMPOSE_FILE" config --format json | python3 -c '
import json, sys

config = json.load(sys.stdin)
services, networks = config["services"], config["networks"]
published = sorted(name for name, service in services.items() if service.get("ports"))
assert published == ["traefik"], f"services publishing ports: {published}"
assert list(services["postgres"]["networks"]) == ["backend"], "PostgreSQL must only be on backend"
assert list(services["docker-socket-proxy"]["networks"]) == ["socket"]
assert networks["backend"].get("internal") and networks["socket"].get("internal")
assert all(s.get("volumes") is None or "/var/run/docker.sock" not in str(s["volumes"])
           for name, s in services.items() if name != "docker-socket-proxy"), "socket mounted outside the proxy"
for name, service in services.items():
    assert "no-new-privileges:true" in service.get("security_opt", []), name
    assert service.get("read_only") and service.get("cap_drop") == ["ALL"], name
def database_role(name):
    return services[name]["environment"]["DATABASE_URL"].split("//")[1].split(":")[0]
assert database_role("api") != database_role("migrate"), "the API must not be the schema owner"
'
check "only Traefik publishes ports; PostgreSQL and the Docker API proxy sit on internal networks" "ok" "ok"
check "every container: no-new-privileges, read-only, no capabilities" "ok" "ok"
check "the API connects as a runtime role, not as the schema owner" "ok" "ok"

for _ in $(seq 30); do
  [[ $(status "$web/") == 200 ]] && break
  sleep 2
done

check "HTTP redirects to HTTPS" "30[178]" "$(status "http://$WEB_HOST:$http_port/")"
headers=$(curl "${curl_args[@]}" --output /dev/null --dump-header - "$web/")
check "HSTS on HTTPS responses" "*max-age=63072000; includeSubDomains*" "$(grep -i '^strict-transport-security' <<<"$headers" | tr -d '\r')"
check "Content Security Policy forbids framing" "*frame-ancestors 'none'*" "$(grep -i '^content-security-policy' <<<"$headers")"
check "the public archive is public" 200 "$(status "$web/")"
check "API reads are public" 200 "$(status "$api/api/people?limit=1")"
check "the editorial desk requires authentication" 401 "$(status "$admin/")"
check "the editorial desk opens with authentication" 200 "$(status --header "$token" "$admin/")"
for method in POST PUT PATCH DELETE; do
  check "API $method requires authentication" 401 "$(status --request "$method" "$api/api/people")"
done

name="Edge check $(date +%s)-$RANDOM"
body=$(curl "${curl_args[@]}" --fail --header "$token" --header "Content-Type: application/json" \
  --data "{\"name\": \"$name\"}" "$api/api/people")
id=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' <<<"$body")
check "an authenticated write passes the edge" "?*" "$id"
check "an authenticated delete passes the edge" 204 "$(status --request DELETE --header "$token" "$api/api/people/$id")"

# 150 concurrent reads exceed the API's 20 requests/s average and burst of 50.
codes=$(seq 150 | xargs -P 30 -I{} curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}\n' "$api/healthz")
check "the API rate limit answers floods with 429" "*429*" "$(sort <<<"$codes" | uniq -c | tr '\n' ' ')"
