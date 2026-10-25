# Minnumst deployment

Ansible deploys the public archive, editorial desk, API, MariaDB and Traefik to a Debian or Ubuntu host with Docker Compose. The application images are built from [`docker/`](../docker/) in this repository. Run the commands below from the repository root.

## Requirements

- The repository's tooling (`make install`), which includes Ansible
- SSH access to a Debian or Ubuntu host with permission to become root
- DNS records for the public, admin, and API hosts pointing to that server
- An Authentik outpost reachable by Traefik for the admin site and API write routes
- Published container images for both frontends and the API

Copy `deploy/inventory/hosts.ini.example` to `deploy/inventory/hosts.ini` and set the remote host and SSH user. Set the image references and hostnames in `deploy/inventory/group_vars/all/vars.yml`.

Create the encrypted secret file and provide URL-safe random passwords (hex is suitable):

```sh
cp deploy/inventory/group_vars/all/vault.example.yml deploy/inventory/group_vars/all/vault.yml
uv run ansible-vault encrypt deploy/inventory/group_vars/all/vault.yml
```

Replace the example values before encrypting. Keep the vault password outside this repository. The vault file is ignored by Git. Deploy with:

```sh
make deploy
```

Ansible prompts for the vault password. Use `make deploy VAULT_ARGS="--vault-password-file ~/.config/ansible/vault-pass"` with a protected local password file, and `INVENTORY=path/to/hosts.ini` for another inventory.

## Image contract

The frontend images must serve their built Vite assets on port 8080. At startup, each image writes browser configuration from its runtime environment. Compose sets `VITE_API_URL` to `https://{{ minnumst_api_domain }}` for both frontends and sets admin `DEBUG` from `minnumst_admin_debug`; configure these values in `inventory/group_vars/all/vars.yml`. The API image must listen on port 8000 and provide the existing `DATABASE_URL`, `CORS_ORIGINS`, and `/readyz` contract. The image references are configurable in `vars.yml`.

The images will be published publicly as `ghcr.io/steinnhauser/minnumst-web`, `minnumst-admin` and `minnumst-api` by the release workflow, which isn't in place yet (see the repository [`TODO.md`](../TODO.md)). Until then, the versions pinned in `vars.yml` don't exist. Pin exact versions, never `latest`.

## Logging

Set `minnumst_log_level` in `inventory/group_vars/all/vars.yml` to `DEBUG`, `INFO`, `WARNING`, or `ERROR`; it defaults to `INFO` and is injected into all three services. Logs are newline-delimited JSON on container stdout/stderr and are available with `docker logs <container>` or `docker compose -f /opt/minnumst/compose.yml logs -f api public admin`. Frontend access records use sanitized routes; API request IDs can be correlated with the `X-Request-ID` response header. Do not log credentials, request bodies, query values, or person slugs.

## Release

The deployment tooling is versioned as `deploy-<version>` (currently `0.1.0`, in `pyproject.toml`). Service images are versioned independently and pinned in the inventory; changing a pin doesn't create or deploy a service release.

The playbook installs Docker Engine and the Compose plugin from Docker's signed Debian/Ubuntu apt repository, templates `/opt/minnumst/compose.yml` with mode `0600`, validates it, then pulls and starts the stack. MariaDB data and Traefik ACME state use persistent named volumes. MariaDB is not published on a host port.

Traefik routes HTTPS for all three hostnames and obtains certificates using the HTTP challenge, so ports 80 and 443 must reach the server. The admin host and API write methods are protected by the configured Authentik forward-auth endpoint. Configure Authentik so the admin app, API hostname, and corresponding origins are accepted by its proxy provider; the public API router remains available for unauthenticated reads. Do not expose the deployment until the Authentik endpoint is reachable and tested.

## Commands

- `make deploy-check` runs ansible-lint and the playbook syntax check against the example inventory (also part of `make lint`).
- `make deploy` runs `site.yml` against `deploy/inventory/hosts.ini`. It installs Docker packages and starts services on the remote host, so confirm the image tags and DNS first.
- `make stack-config` and `make stack-test` render this Compose template locally and run it without Traefik; see [CONTRIBUTING](../CONTRIBUTING.md#local-stack).
