# Contributing

Thanks for contributing to Minnumst. Please discuss substantial changes in an issue before opening a pull request.

## Ground rules

- Keep each pull request focused, ideally on one component (`api/`, `web/`, `admin/`, `deploy/` or `tools/`). Describe the change and the checks you ran, and link related issues.
- Never commit credentials, `.env` files, vault passwords, decrypted secrets, real inventories, or local databases. The root `.gitignore` covers the usual paths; check `git status` before committing anyway.
- Follow the [data protection rules](README.md#data-protection-and-sources) in every change and every sample. Only people who died more than five years ago, no living people (including relatives named in obituaries), nothing confidential, and links with our own summaries instead of copied text. Test data and screenshots stay fictional.
- Story history is immutable: every save appends a revision. Don't add routes or UI that overwrite or delete revisions.
- Update documentation when behaviour, setup or operator steps change. Include screenshots for visual changes.

## Setup

Requirements: [uv](https://docs.astral.sh/uv/) (it installs the Python version in `.python-version`), Node.js 22 (`.nvmrc`) with npm, GNU Make, [OpenTofu](https://opentofu.org) and [Trivy](https://trivy.dev) (for `make lint`'s check of `infra/`), and Docker with Compose v2 for the PostgreSQL tests and the local stack.

```sh
make install
```

This installs the locked dependencies of both workspaces into `.venv` (Python: the API, the deployment tooling and the dev tools) and `node_modules` (Node.js: `web`, `admin` and `packages/static-server`). Run every command from the repository root; `make help` lists them all.

Dependencies are managed at the root as well. Add a Python dependency with `uv add --package minnumst-api <name>` (or `--dev` for tooling), and a Node.js dependency with `npm install <name> --workspace web` (or `--save-dev` at the root for tooling shared by both frontends).

## Checks

| Command              | What it runs                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `make format`        | Ruff (Python) and Prettier (TypeScript, JavaScript, CSS, Markdown, YAML, JSON)                                                                         |
| `make lint`          | Ruff, ESLint, ShellCheck, zizmor, ansible-lint, the playbook syntax check, and `tofu fmt`/`validate` plus a Trivy scan of `infra/`                     |
| `make test`          | pytest on SQLite and Vitest for both frontends and the shared packages, failing below 100% coverage (lines and branches, and functions for TypeScript) |
| `make test-postgres` | The API tests against PostgreSQL in a disposable container (Testcontainers)                                                                            |
| `make openapi-check` | Fails if `api/openapi.json` is stale; regenerate it with `make openapi`                                                                                |
| `make build`         | The API wheel and both frontend production builds                                                                                                      |
| `make validate`      | All of the above, as CI runs them                                                                                                                      |
| `make stack-test`    | The full stack in containers with the end-to-end tests (see below)                                                                                     |

Run `make validate` before opening a pull request, and `make stack-test` as well for changes that cross components, such as the API contract, images, ports or the Compose template.

When an API route or schema changes, change the contract in one pull request, in this order:

1. Change the API and its tests in `api/`.
2. Run `make openapi`. It regenerates `api/openapi.json` and the TypeScript types in `packages/api-client/`; `make openapi-check` (in CI) fails if either generated file is stale.
3. Update the clients in `web/` and `admin/`. Both compile against the generated types, and their test fixtures are typed against them too, so a contract change that breaks a client or a fixture fails its type check.
4. Update the route-level tests in `tools/scripts/e2e_api.py` (every route has a case there), and run `make stack-test`.

When a model changes, run `make migration MESSAGE="describe the change"`, review the generated file in `api/src/minnumst_api/migrations/versions/`, and grant any new table to the runtime role in the same migration. `make test` fails if the models and the migrations disagree.

## Development servers

Run each server in its own terminal. The defaults connect them to each other; override a setting with an environment variable or a `.env` file in the component's folder.

```sh
make dev-api      # http://127.0.0.1:8000, docs at /docs (SQLite in api/minnumst.db)
make dev-web      # http://127.0.0.1:5173
make dev-admin    # http://127.0.0.1:5174
```

## Local stack

`make stack-test` renders the production Compose template from `deploy/templates/compose.yml.j2` with the local variables in `tools/compose/local-vars.example.yml`, adds `tools/compose/local.override.yml` (local image builds, loopback ports, and a stand-in for Authentik's forward-auth endpoint), and then:

1. `make up` builds the three images from `docker/` and starts the whole stack. Traefik listens on `127.0.0.1:8088` (HTTP) and `127.0.0.1:8443` (HTTPS, with its self-signed default certificate), and for direct testing the API and frontends also listen on `127.0.0.1` ports `8000`, `5173` and `5174`;
2. `make wait` waits until the API reports ready and both frontends serve (`WAIT_TIMEOUT`, default 120 seconds), printing the status and recent logs if they don't;
3. `make seed` adds fictional sample people and stories, and is safe to repeat;
4. `make e2e` runs `tools/scripts/e2e_api.py` inside the API container. It covers health and readiness, search, create, rename and delete, duplicate-name rejection, story revisions and public profile reads, and removes only the rows it created;
5. `make contract` runs the real API clients of both frontends against `MINNUMST_API_URL` (default `http://127.0.0.1:8000`), and `make test` skips them. The public archive's suite ([`web/src/api.contract.test.ts`](web/src/api.contract.test.ts)) only reads, and checks the response shapes against the generated types, empty results, the `404` message, accent-insensitive search for `Sólveig Þorgrímsdóttir`, and the `limit` and `offset` bounds. The editorial desk's suite ([`admin/src/api.contract.test.ts`](admin/src/api.contract.test.ts)) creates, renames and writes stories, and checks the shapes, name normalisation and the `409` for names that differ only in accents or case, append-only revisions, the `404` and `422` messages, and request IDs on errors. Its people are all named `Contract test …`, and because the API can't delete a person with a story, `make contract` then removes them from the local database (`tools/scripts/e2e_api.py cleanup-contract`, in the migrate container), even when a test fails;
6. `make edge` runs `tools/scripts/e2e_edge.sh`, which goes through Traefik like a browser: the HTTPS redirect, HSTS and CSP, public reads, authentication on the editorial desk and on every write method (the stand-in accepts `Authorization: Bearer local-edge-test`), and the API rate limit. Authentik itself runs in the stack, and the same script checks that its blueprint applied (mandatory TOTP, the two allowed groups) and that its real forward-auth endpoint sends an anonymous request to the login page. It also checks the rendered production Compose file for network isolation and container hardening;
7. `make backup-test` dumps the database as the nightly backup does, restores it into a fresh database and compares the data;
8. `make browser` runs the Playwright tests in [`tools/browser/`](tools/browser/) at desktop and phone widths: a reader searching the archive and reading a story, and an editor writing two revisions and seeing both in the history. A test fails on any browser console error, which includes Content Security Policy violations, and on serious accessibility problems found by axe. Install the browser once with `npx playwright install chromium`. To run them against the development servers instead of the stack, set `MINNUMST_ARCHIVE_URL` and `MINNUMST_DESK_URL` (default `http://127.0.0.1:5173` and `http://127.0.0.1:5174`); the development servers send no Content Security Policy, so only the stack checks it.

Use `make ps`, `make logs SERVICES="api public admin"` and `make down` to inspect and stop the stack; `down` keeps the database volume. `make db-update` appends revisions when the sample stories change, and `make db-clear` and `make db-reset` wipe the local database after asking for confirmation.

To change the local settings, for example `minnumst_log_level: DEBUG`, copy `tools/compose/local-vars.example.yml` to `tools/compose/local-vars.yml` (ignored by Git). The rendered Compose file is written to the ignored `tools/compose/.local/` with owner-only permissions, because it contains the local database passwords. Never reuse those passwords on a real host.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with the component as the scope, for example `feat(web): add profile filters`, `fix(api): validate blog revisions` or `docs(deploy): clarify vault setup`. Changes to shared tooling use `build:`, `ci:` or `chore:` without a component scope.
Use `!` or a `BREAKING CHANGE:` footer for incompatible changes. Release notes and version bumps come from these messages: `feat` bumps the minor version, `fix` and `perf` the patch version, and breaking changes the major version (the minor version before 1.0). A commit counts towards a component when it touches the component's files and isn't scoped to another component.

## Releases

On an up-to-date `main`, run `make release COMPONENT=api DRY_RUN=1` to preview the next version and changelog section, then `make release COMPONENT=api` to commit and tag it. Add `INCREMENT=MINOR` (or `PATCH`, `MAJOR`) to override the computed increment. Push the commit and tag together with the `git push --atomic` command it prints; CI publishes the image and the GitHub Release. GitHub ignores tags pushed more than three at a time, so push at most three release tags at once. To rerun a release (or start one GitHub skipped), run `gh workflow run ci.yml --ref <tag>`.
