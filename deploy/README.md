# Eftirmal Deployment

Ansible deployment for the public frontend, admin frontend, API, MariaDB, and Traefik on a Debian-based host. The apps are deployed as prebuilt container images; this repository does not build or publish those images.

## Requirements

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- SSH access to a Debian or Ubuntu host with permission to become root
- DNS records for the public, admin, and API hosts pointing to that server
- An Authentik outpost reachable by Traefik for the admin site and API write routes
- Published container images for both frontends and the API

Install the controller dependencies with `make install`. Copy `inventory/hosts.ini.example` to `inventory/hosts.ini` and set the remote host and SSH user. Set the image references and hostnames in `inventory/group_vars/all/vars.yml`.

Create the encrypted secret file and provide URL-safe random passwords (hex is suitable):

```sh
cp inventory/group_vars/all/vault.example.yml inventory/group_vars/all/vault.yml
uv run ansible-vault encrypt inventory/group_vars/all/vault.yml
```

Replace the example values before encrypting. Keep the vault password outside this repository. The vault file is ignored by Git. Deploy with:

```sh
make deploy
```

Ansible prompts for the vault password. Use `make deploy VAULT_ARGS=--vault-password-file\ ~/.config/ansible/vault-pass` when using a protected local password file.

## Image contract

The frontend images must serve their built Vite assets on port 80. Build each frontend with `VITE_API_URL=https://<api-host>` before publishing; Vite embeds this value into the static bundle, so setting a container runtime environment variable cannot change it later. The API image must listen on port 8000 and provide the existing `DATABASE_URL`, `CORS_ORIGINS`, and `/readyz` contract. The image references are configurable in `vars.yml`.

The playbook installs Docker Engine and the Compose plugin from Docker's signed Debian/Ubuntu apt repository, templates `/opt/eftirmal/compose.yml` with mode `0600`, validates it, then pulls and starts the stack. MariaDB data and Traefik ACME state use persistent named volumes. MariaDB is not published on a host port.

Traefik routes HTTPS for all three hostnames and obtains certificates using the HTTP challenge, so ports 80 and 443 must reach the server. The admin host and API write methods are protected by the configured Authentik forward-auth endpoint. Configure Authentik so the admin app, API hostname, and corresponding origins are accepted by its proxy provider; the public API router remains available for unauthenticated reads. Do not expose the deployment until the Authentik endpoint is reachable and tested.

## Commands

- `make install` installs the pinned Python tooling with uv.
- `make format` and `make format-check` format/check Python files with Ruff.
- `make lint` runs Ruff and ansible-lint.
- `make check` runs formatting checks and both linters.
- `make validate` also runs the Ansible syntax check using the example inventory.
- `make deploy` runs `site.yml` against `inventory/hosts.ini`.

Override the inventory with `make deploy INVENTORY=path/to/hosts.ini`. Ansible prompts for the vault password by default. Confirm the image tags and DNS before deployment; `make deploy` installs Docker packages and starts services on the remote host.
