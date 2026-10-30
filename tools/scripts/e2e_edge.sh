#!/usr/bin/env bash
# End-to-end checks of the network edge, run by `make edge` against the local
# stack: requests go through Traefik exactly as a browser's would, and the
# rendered production Compose file is checked for network isolation.
set -euo pipefail

: "${WEB_HOST:?}" "${ADMIN_HOST:?}" "${API_HOST:?}" "${AUTH_HOST:?}" "${COMPOSE_PROJECT:?}" "${BASE_COMPOSE_FILE:?}"
http_port=8088
https_port=8443
token="Authorization: Bearer local-edge-test"
web="https://$WEB_HOST:$https_port"
admin="https://$ADMIN_HOST:$https_port"
api="https://$API_HOST:$https_port"
auth="https://$AUTH_HOST:$https_port"
# Resolve the hosts to loopback. Traefik serves its self-signed default
# certificate locally (there is no ACME), hence --insecure.
curl_args=(--silent --show-error --insecure --max-time 10)
for host in "$WEB_HOST" "$ADMIN_HOST" "$API_HOST" "$AUTH_HOST"; do
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
assert list(services["authentik-worker"]["networks"]) == ["backend"], "the Authentik worker needs no route out"
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

# Authentik itself: the edge checks above use the stand-in, which needs no login.
for _ in $(seq 90); do
  [[ $(status "$auth/-/health/ready/") == 200 ]] && break
  sleep 5
done
check "Authentik is ready behind Traefik" 200 "$(status "$auth/-/health/ready/")"
check "Authentik's login page has HSTS" "*max-age=63072000; includeSubDomains*" \
  "$(curl "${curl_args[@]}" --output /dev/null --dump-header - "$auth/" | grep -i '^strict-transport-security' | tr -d '\r')"

in_stack() { docker compose --project-name "$COMPOSE_PROJECT" exec -T "$@"; }
authentik_report() {
  in_stack authentik-worker ak shell -c '
from authentik.blueprints.models import BlueprintInstance
from authentik.core.models import Application, User
from authentik.outposts.models import Outpost
from authentik.policies.models import PolicyBinding
from authentik.providers.proxy.models import ProxyProvider
from authentik.stages.authenticator_validate.models import AuthenticatorValidateStage

blueprint = BlueprintInstance.objects.get(name="Minnumst - editorial access")
stage = AuthenticatorValidateStage.objects.get(name="default-authentication-mfa-validation")
provider = ProxyProvider.objects.get(name="minnumst-forward-auth")
application = Application.objects.get(slug="minnumst")
outpost = Outpost.objects.get(managed="goauthentik.io/outposts/embedded")
admin = User.objects.get(username="akadmin")
print(
    "minnumst-check",
    "blueprint=" + blueprint.status,
    "mfa=" + stage.not_configured_action + "/" + ",".join(stage.device_classes),
    "mode=" + provider.mode,
    "cookie=" + provider.cookie_domain,
    "groups=" + ",".join(sorted(b.group.name for b in PolicyBinding.objects.filter(target=application))),
    "outpost=" + ",".join(p.name for p in outpost.providers.all()),
    "password=" + str(admin.check_password("local_only_authentik_password")),
)
' 2>/dev/null | grep '^minnumst-check ' || true
}
# The worker applies the blueprint in the background after migrating the database.
for _ in $(seq 60); do
  report=$(authentik_report)
  [[ $report == *"blueprint=successful"* ]] && break
  sleep 5
done
check "the Authentik blueprint applied" "*blueprint=successful*" "$report"
check "every Authentik login requires TOTP" "*mfa=configure/totp*" "$report"
check "the session cookie covers the desk and the API" "*mode=forward_domain*cookie=minnumst.local*" "$report"
check "only the editors and Authentik's admins may pass" "*groups=authentik Admins,minnumst-editors*" "$report"
check "the outpost serves the provider" "*outpost=minnumst-forward-auth*" "$report"
check "the first administrator's password hash works" "*password=True*" "$report"

forward_auth() { # What Traefik would get from the real endpoint for a request to the desk.
  in_stack auth-stub python -c '
import http.client, sys

connection = http.client.HTTPConnection("authentik-server", 9000, timeout=10)
connection.request("GET", "/outpost.goauthentik.io/auth/traefik", headers={
    "X-Forwarded-Proto": "https", "X-Forwarded-Host": sys.argv[1],
    "X-Forwarded-Uri": "/", "X-Forwarded-Method": "GET",
})
response = connection.getresponse()
print(response.status, response.getheader("Location", ""))
' "$ADMIN_HOST" 2>/dev/null || true
}
# The outpost picks up its provider shortly after the blueprint applies.
for _ in $(seq 60); do
  answer=$(forward_auth)
  [[ $answer == "302 https://$AUTH_HOST/"* ]] && break
  sleep 5
done
check "the real forward-auth endpoint sends an anonymous request to the login page" "302 https://$AUTH_HOST/*" "$answer"

# 150 concurrent reads exceed the API's 20 requests/s average and burst of 50.
codes=$(seq 150 | xargs -P 30 -I{} curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}\n' "$api/healthz")
check "the API rate limit answers floods with 429" "*429*" "$(sort <<<"$codes" | uniq -c | tr '\n' ' ')"
