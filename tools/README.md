# Minnumst | Tools

These helpers coordinate the four components (`web/`, `admin/`, `api/` and `deploy/`) of this repository. The root `Makefile` wraps the common targets (`make validate`, `make stack-test`, `make up`, `make down`, …); run the others here with `make <target>`, or from the repository root with `make -C tools <target>`.

## Project checks

- `make status` shows the Git status of the repository.
- `make validate` runs each component's own validation target.
- `make validate-public`, `make validate-admin`, `make validate-api`, and `make validate-deploy` run the checks for one component.
- `make check` checks the helpers themselves: Ruff format and lint for `scripts/*.py` (configured in `ruff.toml`, run with the API's environment because the scripts import `minnumst_api`) and ShellCheck for `scripts/*.sh`. `make format` formats the Python scripts.

## Versioned releases

Each component keeps its own version and Commitizen configuration, and tags are prefixed by component (`web-0.1.1`, `admin-0.2.1`, `api-0.1.2`, `deploy-0.1.0`). The release helpers from the separate repositories were removed during the move into this repository. Releases and image publishing will be redesigned together with the repository-level CI workflow.

## Local Compose test

Requirements: Docker Engine, either the Docker Compose plugin or `docker-compose`, and the deployment component's Ansible environment (`make -C ../deploy install` if it is not installed).

1. Copy `compose/local-vars.example.yml` to `compose/local-vars.yml`. The example database passwords are disposable local-only values; adjust them if desired. Set `minnumst_log_level: DEBUG` there for detailed service logs; it defaults to `INFO`. Supported levels are `DEBUG`, `INFO`, `WARNING`, and `ERROR`.
2. The local Compose override supplies `VITE_API_URL=http://127.0.0.1:8000` at container startup, so no frontend build arguments are required.
3. Run `make compose-config` to render the deployment template and validate the production Compose configuration plus the local override.
4. Run `make compose-up` to build the three app images locally and start MariaDB, API, and both frontends. Traefik is intentionally not started; app ports bind only to `127.0.0.1` (`5173`, `5174`, and `8000`).
5. Run `make compose-wait` to wait until the API reports ready and both frontends serve (`WAIT_TIMEOUT` seconds, default 120). On a timeout it prints the service status and recent logs.
6. Run `make db-seed` to add fictional sample people and stories. It is safe to repeat. `make db-update` appends a revision only when a sample story changes. `make db-clear` clears all local API tables, and `make db-reset` clears and reseeds them; both require typing the action name to confirm and are guarded to the `minnumst_local` MariaDB service.
7. Run `make e2e` to exercise health/readiness, person search/create/update/delete, normalized duplicate rejection, blog writes/reads, immutable revision history, and public profile reads against the running API and MariaDB. The test uses a unique run ID and removes only its own fixture rows, even if an assertion fails; sample archive records are preserved.
8. Run `make compose-ps`, `make compose-logs SERVICES=api public admin`, and `make compose-down` to inspect or stop the local stack. The named MariaDB volume is retained by `compose-down`. The service logs are JSON on stdout/stderr, like production `docker logs` output.

The rendered Compose file is stored under ignored `compose/.local/` with owner-only permissions because it contains the local database credentials. Do not use the example credentials on a deployed host. Seed records are clearly labeled fictional samples; clear/reset operate only on the disposable local database. These helpers do not run Ansible against a remote machine.
