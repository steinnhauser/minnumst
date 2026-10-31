#!/usr/bin/env bash
# Opens SSH in the Hetzner firewall for this machine's current address, and closes
# it again. OpenTofu makes the change, so the state always matches the firewall.
set -euo pipefail

tofu_cmd=(tofu -chdir=infra)

usage() {
  echo 'Usage: make ssh open|close|status'
  exit 2
}

set_sources() {
  "${tofu_cmd[@]}" apply -input=false -auto-approve -compact-warnings \
    -target=hcloud_firewall.host -var "ssh_source_ips=$1" >/dev/null
}

# This machine's public addresses as a Terraform list. IPv6 is optional.
my_sources() {
  local ipv4 ipv6 sources=()
  ipv4="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
  ipv6="$(curl -6 -fsS --max-time 10 https://api6.ipify.org 2>/dev/null || true)"
  [[ "$ipv4" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && sources+=("\"$ipv4/32\"")
  [[ "$ipv6" =~ ^[0-9a-fA-F:]+$ && "$ipv6" == *:* ]] && sources+=("\"$ipv6/128\"")
  if ((${#sources[@]} == 0)); then
    echo 'Could not find this machine'\''s public address.' >&2
    return 1
  fi
  local IFS=,
  echo "[${sources[*]}]"
}

reachable() {
  local host
  host="$("${tofu_cmd[@]}" output -raw ipv4_address)"
  # shellcheck disable=SC2016 # The inner shell expands $0.
  timeout 3 bash -c 'exec 3<>"/dev/tcp/$0/22"' "$host" 2>/dev/null
}

open_ssh() {
  set_sources "$(my_sources)"
  # The firewall takes a few seconds to apply the new rule.
  for _ in {1..20}; do
    if reachable; then
      echo 'SSH is open for this machine.'
      return 0
    fi
    sleep 3
  done
  echo 'SSH was opened, but this machine still cannot reach it.' >&2
  return 1
}

close_ssh() {
  if set_sources '[]'; then
    echo 'SSH is closed.'
  else
    echo "WARNING: could not close SSH. Run 'make ssh close'." >&2
    return 1
  fi
}

case "${1:-}" in
  open) open_ssh ;;
  close) close_ssh ;;
  status)
    if reachable; then echo 'SSH is reachable from this machine.'; else echo 'SSH is not reachable from this machine.'; fi
    ;;
  run)
    shift
    # Close on every way out, including a failed run or Ctrl-C.
    trap close_ssh EXIT
    open_ssh
    "$@"
    ;;
  *) usage ;;
esac
