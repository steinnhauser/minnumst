# Contributing

Thanks for contributing to Minnumst. Please discuss substantial changes in an issue before opening a pull request.

## Ground rules

- Keep each pull request focused, ideally on one component (`api/`, `web/`, `admin/`, `deploy/` or `tools/`). Describe the change and the checks you ran, and link related issues.
- Never commit credentials, `.env` files, vault passwords, decrypted secrets, real inventories, or local databases. The root `.gitignore` covers the usual paths; check `git status` before committing anyway.
- Story history is immutable: every save appends a revision. Don't add routes or UI that overwrite or delete revisions.
- Update documentation when behaviour, setup or operator steps change. Include screenshots for visual changes.

## Setup

Requirements: [uv](https://docs.astral.sh/uv/) (it installs the Python version in `.python-version`), Node.js 22 (`.nvmrc`) with npm, GNU Make, and Docker with Compose v2 for the MariaDB tests and the local stack.

```sh
make install
```

This installs the locked dependencies of both workspaces into `.venv` (Python: the API, the deployment tooling and the dev tools) and `node_modules` (Node.js: `web`, `admin` and `packages/static-server`). Run every command from the repository root; `make help` lists them all.

Dependencies are managed at the root as well. Add a Python dependency with `uv add --package minnumst-api <name>` (or `--dev` for tooling), and a Node.js dependency with `npm install <name> --workspace web` (or `--save-dev` at the root for tooling shared by both frontends).

## Checks

| Command              | What it runs                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| `make format`        | Ruff (Python) and Prettier (TypeScript, JavaScript, CSS, Markdown, YAML, JSON) |
| `make lint`          | Ruff, ESLint, ShellCheck, ansible-lint and the playbook syntax check           |
| `make test`          | pytest on SQLite and Vitest for both frontends and the shared server           |
| `make test-mariadb`  | The API tests against MariaDB in a disposable container (Testcontainers)       |
| `make openapi-check` | Fails if `api/openapi.json` is stale; regenerate it with `make openapi`        |
| `make build`         | The API wheel and both frontend production builds                              |
| `make validate`      | All of the above, as CI runs them                                              |
| `make stack-test`    | The full stack in containers with the end-to-end tests (see below)             |

Run `make validate` before opening a pull request, and `make stack-test` as well for changes that cross components, such as the API contract, images, ports or the Compose template.

When an API route or schema changes, regenerate `api/openapi.json` with `make openapi` and update both frontends in the same pull request.

## Development servers

Run each server in its own terminal. The defaults connect them to each other; override a setting with an environment variable or a `.env` file in the component's folder.

```sh
make dev-api      # http://127.0.0.1:8000, docs at /docs (SQLite in api/minnumst.db)
make dev-web      # http://127.0.0.1:5173
make dev-admin    # http://127.0.0.1:5174
```

## Local stack

`make stack-test` renders the production Compose template from `deploy/templates/compose.yml.j2` with the local variables in `tools/compose/local-vars.example.yml`, adds `tools/compose/local.override.yml` (local image builds, loopback ports, and a stand-in for Authentik), and then:

1. `make up` builds the three images from `docker/` and starts the whole stack. Traefik listens on `127.0.0.1:8088` (HTTP) and `127.0.0.1:8443` (HTTPS, with its self-signed default certificate), and for direct testing the API and frontends also listen on `127.0.0.1` ports `8000`, `5173` and `5174`;
2. `make wait` waits until the API reports ready and both frontends serve (`WAIT_TIMEOUT`, default 120 seconds), printing the status and recent logs if they don't;
3. `make seed` adds fictional sample people and stories, and is safe to repeat;
4. `make e2e` runs `tools/scripts/e2e_api.py` inside the API container. It covers health and readiness, search, create, rename and delete, duplicate-name rejection, story revisions and public profile reads, and removes only the rows it created;
5. `make edge` runs `tools/scripts/e2e_edge.sh`, which goes through Traefik like a browser: the HTTPS redirect, HSTS and CSP, public reads, authentication on the editorial desk and on every write method (the stand-in accepts `Authorization: Bearer local-edge-test`), and the API rate limit. It also checks the rendered production Compose file for network isolation and container hardening.

Use `make ps`, `make logs SERVICES="api public admin"` and `make down` to inspect and stop the stack; `down` keeps the MariaDB volume. `make db-update` appends revisions when the sample stories change, and `make db-clear` and `make db-reset` wipe the local database after asking for confirmation.

To change the local settings, for example `minnumst_log_level: DEBUG`, copy `tools/compose/local-vars.example.yml` to `tools/compose/local-vars.yml` (ignored by Git). The rendered Compose file is written to the ignored `tools/compose/.local/` with owner-only permissions, because it contains the local database passwords. Never reuse those passwords on a real host.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with the component as the scope, for example `feat(web): add profile filters`, `fix(api): validate blog revisions` or `docs(deploy): clarify vault setup`. Changes to shared tooling use `build:`, `ci:` or `chore:` without a component scope.
Use `!` or a `BREAKING CHANGE:` footer for incompatible changes. Release notes and version bumps come from these messages: `feat` bumps the minor version, `fix` and `perf` the patch version, and breaking changes the major version (the minor version before 1.0). A commit counts towards a component when it touches the component's files and isn't scoped to another component.

## Releases

On an up-to-date `main`, run `make release COMPONENT=api DRY_RUN=1` to preview the next version and changelog section, then `make release COMPONENT=api` to commit and tag it. Add `INCREMENT=MINOR` (or `PATCH`, `MAJOR`) to override the computed increment. Push the commit and tag together with the `git push --atomic` command it prints; CI publishes the image and the GitHub Release.
