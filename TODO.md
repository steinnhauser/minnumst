# Minnumst Roadmap

The single backlog for the repository. Items 1 to 10 are ordered by priority; the component backlog at the end collects the smaller items for each component.

Context: Minnumst was previously **Eftirmál**, spread over four private repositories (`eftirmal-api`, `eftirmal`, `eftirmal-admin`, `eftirmal-deploy`). It is now a single public monorepo with one toolchain per language (a uv workspace and an npm workspace), one `Makefile`, one workflow, one `.gitignore` and one license. `minnumst` is the only target name for packages, images, hosts, paths and variables; the old names appear only in historical changelog entries and the README's History section.

**Current focus: `api/`, `web/` and `admin/`** (items 1 to 4). Items that are mainly `deploy/` work (6, 7, 9 and 10) are deferred.

## 1. Finish the move to a public monorepo: releases, the container registry and CI

The repository layout, toolchains and CI are unified:

- [x] One uv workspace (`pyproject.toml`, `uv.lock`, `.venv`, `.python-version`) for `api`, `deploy` and `tools/scripts`, and one npm workspace (`package.json`, `package-lock.json`) for `web`, `admin` and `packages/static-server`. Ruff, Prettier, ESLint, TypeScript (`tsconfig.base.json`) and Vitest are configured once at the root.
- [x] One `Makefile`, one workflow (`checks`, `tests`, `e2e` and the aggregate `ci-ok`, sharing `.github/actions/setup`), one `.gitignore`, one `.dockerignore`, one `.editorconfig` and one `LICENSE`.
- [x] The two frontends share one static server package and one Dockerfile (`docker/frontend.Dockerfile`); the API image is `docker/api.Dockerfile`. All images build from the repository root.
- [x] CI, local development and the images all use Python 3.13 and Node.js 22, and `requires-python`/`engines` say so.
- [x] Placeholders and multi-repository wording are gone (`ghcr.io/OWNER/…` in the local variables, the private-GHCR `docker login` note, "owning repositories").

Releasing is not done. Each old repository had its own `CI and Release` workflow, triggered by bare SemVer tags (`0.1.2`), that built a multi-arch image and pushed it to private GHCR packages. Those workflows were deleted in the merge, and nothing has replaced them. As a result:

- No `ghcr.io/steinnhauser/minnumst-*` image can be pulled anonymously, and the repository has no GitHub Releases.
- `deploy/inventory/group_vars/all/vars.yml` pins `minnumst-web:0.1.1`, `minnumst-admin:0.2.1` and `minnumst-api:0.1.2`, which do not exist.
- The existing tags can't be used to build them either. `api-0.1.2`, `web-0.1.1`, `admin-0.2.1` and the rest point at code from before the rename (`api/src/eftirmal_api/`, npm package `eftirmal`) and from before the workspace layout. **Don't backfill images from these tags.** Cut new releases from the current `main` instead (step 1.6).

### 1.1 Release job and `make release`

- [x] A `release` job in `ci.yml` runs on component tags (`api-*`, `web-*`, `admin-*`, `deploy-*`) after `checks`, `tests` and `e2e` pass on the tagged commit. It verifies the tag against the manifest, the changelog and `main`, pushes `ghcr.io/steinnhauser/minnumst-<component>:<version>` and `:<major>.<minor>` for amd64 and arm64 with OCI labels, provenance and an SBOM, and creates a GitHub Release from the component's changelog section. Tag runs are never cancelled.
- [x] `make release COMPONENT=… [INCREMENT=…] [DRY_RUN=1]` (`tools/scripts/release.py`) derives the increment from the Conventional Commits that touched the component since its last tag (ignoring commits scoped to another component), updates the manifest and lockfile (and `api/openapi.json`), writes the changelog section, commits and tags. It never pushes. This replaces Commitizen, which can't scope a release to one component's files.
- [x] The changelogs share one header, and the API reports its package version in `openapi.json`.
- [ ] Sign images keylessly with cosign, if a consumer needs signatures beyond the provenance attestation.
- [ ] Enforce the scope convention: a PR check that the PR title is a Conventional Commit whose scope matches the folders it touches. With squash merging (1.5), the title becomes the commit on `main` that `make release` reads.

### 1.3 Faster CI

- [x] Run everything on pushes to `main`, tags, pull requests, `workflow_dispatch` and a weekly `schedule` (new vulnerabilities in unchanged code and images).
- [ ] Skip work a change can't affect, with a `changes` job (`dorny/paths-filter`): documentation-only changes skip `tests` and `e2e`, and changes outside `api/`, `web/`, `admin/`, `packages/`, `docker/`, `deploy/templates/`, `tools/` and the lockfiles skip `e2e`. `ci-ok` already treats skipped jobs as passing.
- [ ] Cache the Docker layers of the `e2e` image builds (Buildx with the GHA cache), so unchanged dependency layers aren't rebuilt on every run.

### 1.4 Container registry and image references

- [ ] Before the first release:
  - Check whether any `minnumst-*` or `eftirmal*` package already exists under the account (`gh api /users/steinnhauser/packages?package_type=container` needs the `read:packages` scope).
  - If a `minnumst-*` package was created by an archived repository, either grant `steinnhauser/minnumst` **Write** under _Package settings → Manage Actions access_ or delete the package. Otherwise the first push from this repository fails with 403.
- [ ] After the first push, set each `minnumst-*` package to **public** and confirm it shows as linked to `steinnhauser/minnumst`. Public images need no registry credential on the host.
- [ ] Repin `deploy/inventory/group_vars/all/vars.yml` to the first published versions. Pin by digest as well (`…:0.1.3@sha256:…`) so a re-pushed tag can't change what is deployed. Have the release job print the digest in the release notes.
- [ ] Optional follow-up: after an image release, open a PR that bumps the matching pin in `vars.yml` (Dependabot can't update GHCR references in Ansible variables).
- [ ] Decide what happens to the old `eftirmal*` packages: delete them, or keep them private with a description pointing here. Add a pointer to `steinnhauser/minnumst` in the README of each archived repository.

### 1.5 Repository settings for a public repository

- [ ] Add a ruleset on `main`:
  - require a pull request and the `ci-ok` check;
  - block force pushes and deletion;
  - require linear history.

  `main` currently has no protection or ruleset.

- [ ] Add a tag ruleset for `api-*`, `web-*`, `admin-*` and `deploy-*` that blocks deleting or moving tags, so a published version always maps to one commit.
- [ ] Merge settings: squash merge only, using the PR title as the commit message; delete head branches after merge. Today both merge commits and squash are enabled, and branches aren't deleted.
- [ ] Turn on secret scanning with push protection, Dependabot security updates, and private vulnerability reporting. Add a short `SECURITY.md`.

### 1.6 Cut over

- [ ] Land 1.4 and 1.5. Then release each component from `main` with `make release`. The commits since the old tags are refactors and build changes, so the first releases need `INCREMENT=MINOR`: `api-0.2.0`, `web-0.2.0`, `admin-0.3.0` and `deploy-0.2.0`. Confirm that each image pulls anonymously and runs non-root on amd64 and arm64.
- [ ] Repin `deploy/inventory/group_vars/all/vars.yml` to the published versions.

**Done when:**

- Pushing `api-X.Y.Z` (and likewise for web and admin) publishes a signed, attested, public multi-arch image and a GitHub Release with component-only notes, with no manual registry steps.
- `deploy/` pins images that exist.
- A documentation-only PR skips the tests and still gets a green `ci-ok`.

## 2. Synchronise all API endpoints and client calls

The API and its clients have to agree on every route, field, status code and limit, and that agreement has to be tested rather than assumed. Today, both frontends hand-write their own types and mock `fetch` in their tests with hand-written fixtures. The only check against the real API is `tools/scripts/e2e_api.py`, which exercises the API directly and never runs the clients' code. Start with `api` and `web`, then apply the same pattern to `admin`.

Current routes and their callers (from `api/openapi.json`, `web/src/api.ts` and `admin/src/api.ts`):

| Route                                 | `web`                                                            | `admin`                                          |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/people`                     | `searchPeople`: suggestions (`limit` 8) and results (`limit` 50) | `loadPeople`: pages through everyone, 100 a time |
| `POST /api/people`                    | —                                                                | `createPerson`                                   |
| `GET /api/people/by-slug/{slug}`      | `getPersonBySlug`                                                | —                                                |
| `GET /api/people/{id}`                | —                                                                | — (only `e2e_api.py`)                            |
| `PATCH /api/people/{id}`              | —                                                                | `updatePersonName`                               |
| `DELETE /api/people/{id}`             | —                                                                | — (only `e2e_api.py`)                            |
| `GET /api/people/{id}/blog`           | —                                                                | —                                                |
| `PUT /api/people/{id}/blog`           | —                                                                | `savePersonRevision`                             |
| `GET /api/people/{id}/blog/revisions` | —                                                                | `loadPersonRevisions`                            |

### 2.1 One source of truth for the contract

- [ ] Generate TypeScript types from `api/openapi.json` (for example with `openapi-typescript`), starting with `web/src/api.ts` and then `admin/src/api.ts`. Add a `check` step that fails when the generated file is stale, mirroring `make openapi-check`, and run it in `make validate`.
- [ ] Type the mocked responses in `web/src/api.test.ts` (and admin's) against the generated types, so a fixture can't describe a response shape the API doesn't return.
- [ ] Declare the error responses in the OpenAPI spec. Every route currently documents only `200`/`201` and `422`, but the API also returns `404` (person or blog not found) and `409` (duplicate normalised name, or deleting a person with a story). Add `responses=` with a shared error model, so the generated types and the docs include them.
- [ ] Make a change to `api/openapi.json` count as a frontend change once path filters exist (item 1.3).

### 2.2 Contract tests against the running API

- [ ] Add a contract suite to `web` (for example `src/api.contract.test.ts`, skipped unless `MINNUMST_API_URL` is set). It should call the real `searchPeople` and `getPersonBySlug` against the seeded stack and assert:
  - response shapes;
  - empty results;
  - the `404` message;
  - a non-ASCII and accent-insensitive search (`Sólveig` / `solveig`);
  - the `limit` bounds.

  Wire it into `make stack-test` and the CI `e2e` job, then add the same suite for admin's write calls.

- [ ] Keep `tools/scripts/e2e_api.py` as the route-level test. Make sure it covers every route in the table above, including `GET /api/people/{id}/blog` and the `X-Request-ID` echo.

### 2.3 Fix the drift found so far

- [x] **API version:** the spec reported a hard-coded `0.1.0`. It now reads the package version, and `make release` regenerates `openapi.json`.
- [ ] **Validation errors:** `422` responses carry `detail` as a list, which both clients replace with "The Minnumst API returned 422." Either format the first validation message in the client, or return a single error shape from the API for every 4xx. Add `maxLength={255}` to the web search input to match the API's `query` limit.
- [ ] **Result limits:** `web` asks for 50 results and shows "Showing 50 of N people" without a way to see the rest. Either page through results with `offset`, or tell the reader to refine the search. Document the API's bounds (`limit` 1 to 100, empty `query` returns everyone in name order) in the route descriptions.
- [ ] **Slugs:** `PATCH /api/people/{id}` renames a person but keeps the old slug. Decide whether slugs are permanent public identifiers (and document that) or whether renames create a new slug that redirects from the old one. Then give `web` real profile URLs (`/people/<slug>` with a history-API route; the shared static server already falls back to `index.html`), so profiles can be linked and bookmarked. Today, `by-slug` is only reached by clicking a search result.
- [ ] **Unused routes:** no client calls `GET /api/people/{id}`, `GET /api/people/{id}/blog` or `DELETE /api/people/{id}`. For each, either use it (for example, admin could load one person instead of paging through everyone) or document why it exists. `DELETE` only removes a person without a story, returns 409 otherwise, and goes through Authentik. Make sure the docs say this and that no UI implies stories or revisions can be deleted.
- [ ] **Request IDs:** both clients send `X-Request-ID`, and the API validates it, echoes it and exposes it through CORS. Document it as a header parameter in the spec, and show it in client error messages so a reader's report can be matched to a log line.
- [ ] **Admin, before deploying:** cross-origin writes through Authentik forward-auth need `credentials: "include"` in `admin/src/api.ts` and `allow_credentials=True` (with explicit origins) in the API's CORS settings. Neither is set. Also, admin sends `Content-Type: application/json` on GET requests, which triggers a CORS preflight on every read.

### 2.4 Process

- [ ] Document the contract-change workflow in CONTRIBUTING: change the API, regenerate the spec, regenerate the client types, then update the clients and the contract tests, all in one PR.

**Done when:** every route has a client caller covered by a contract test against the real API, or a documented reason to exist; both frontends use generated types; and CI fails when the spec, the generated types or a client fall out of step.

## 3. Keep the rename complete and guarded

- [ ] Add a CI step that fails on new `eftirm` matches (case-insensitive, including `Eftirmál`) outside an allowlist: the README History section and the `CHANGELOG.md` entries written before the rename. Cover file paths, contents, image names and package names.
- [ ] Use `minnumst.org` consistently as the real domain, while inventories and examples keep using `minnumst.example`. Check that the OpenAPI title and description, HTML `<title>`, logger names (`minnumst-public`, …) and the `window.__MINNUMST_ENV__` key all follow one naming scheme.
- [ ] Update the GitHub repository description and website field. Add the topics `monorepo` and `github-actions` once item 1 lands.

## 4. Browser end-to-end tests and test quality gates

The `e2e` job tests the API only. No test loads either frontend in a browser against the real stack.

- [ ] Add Playwright tests against the local Compose stack: search and profile in `web`; create a person, rename, write two revisions and view the history in `admin`. Run them in the `e2e` job.
- [ ] Add automated accessibility checks (axe) to those flows, at desktop and phone widths.
- [ ] Set coverage thresholds for pytest and Vitest at the current level, so coverage can only go up.

## 5. Introduce database migrations

PostgreSQL replaced MariaDB before the first deployment, for its SCRAM-SHA-256 authentication, role and privilege model, native UUIDs, a fully unprivileged container, and its tooling (Alembic, CloudNativePG for item 10). The API connects with `psycopg` 3.

- [ ] Replace `create_all` at startup with Alembic. Add a baseline migration that matches the current schema on both PostgreSQL and SQLite, and test it in CI (upgrade from empty, and a downgrade smoke test).
- [ ] Decide where migrations run in deployment: a one-off `api` container step in `site.yml` before `up`, not on every replica start. Document how to roll back.
- [ ] Do this before any schema change, including the media contract in the component backlog.
- [ ] With migrations in place, split the database roles: a migration role that owns the schema, and a runtime role for the API with only `SELECT`/`INSERT` on `blog_revisions` (append-only enforced by privileges) and the minimum on the other tables. `create_all` at startup currently needs the API role to own the schema.
- [ ] Use TLS between the API and PostgreSQL if the database ever leaves the internal `backend` network (for example a managed database).

## 6. Backups with a tested restore

- [ ] Add a scheduled `pg_dump` (custom format, run as the read-only-capable `postgres` user) to `deploy/`, with retention and an off-host copy. Named volumes are not backups.
- [ ] Add a restore playbook or `make` target, plus a CI job that restores a dump into a disposable PostgreSQL and runs `tools/scripts/e2e_api.py` reads against it.
- [ ] Write the restore runbook in `deploy/README.md`, including the RPO/RTO the setup actually achieves.

## 7. Monitoring, alerting and request tracing

- [ ] Add Prometheus, Grafana and Alertmanager to the Compose template as an optional profile. Alert on host availability, container health, `/readyz`, disk space and certificate expiry. Keep the Traefik dashboard private.
- [ ] Add request correlation IDs across Traefik, the frontends' servers and the API's JSON logs, plus route and database metrics. Keep the logging rules: no bodies, query values, credentials or slugs.
- [ ] Ship Grafana dashboards as code in `deploy/`.

## 8. Harden the write boundary and the supply chain

- [x] Edge tests: the `e2e` job runs the production Compose template with Traefik and a stand-in forward-auth, and `tools/scripts/e2e_edge.sh` proves that the editorial desk and every write method need authentication, reads stay public, HTTP redirects to HTTPS, HSTS and the CSP are sent, and the API rate limit holds. It also asserts from the rendered production file that only Traefik publishes ports, PostgreSQL and the Docker API proxy sit on internal networks, and every container is hardened.
- [x] Security headers: a same-origin CSP, `frame-ancestors 'none'`, `nosniff`, referrer, permissions and cross-origin policies from the static server; HSTS and the same basics for every route from Traefik. `trustForwardHeader` stays `true` because Traefik is the edge: it already discards client-sent `X-Forwarded-*` headers, so it only passes its own to Authentik.
- [x] Container hardening: read-only root filesystems, no capabilities, `no-new-privileges`, log rotation, root-owned code, no package managers in runtime images, OS fixes applied at build, and a Docker API proxy instead of the socket for Traefik.
- [x] Supply chain: actions pinned to commit SHAs, job-scoped permissions, `persist-credentials: false`, zizmor in `make lint`, CodeQL (security-extended) for Python, TypeScript and the workflow, dependency review on pull requests, Dependabot with a seven-day cooldown, and a Trivy gate on fixable high and critical image vulnerabilities before any release.
- [ ] Pin base images by digest (`node:22-alpine@sha256:…`, `python:3.13-slim-bookworm@sha256:…`, `postgres:18-alpine@…`, `traefik:v3.7.16@…`). Dependabot keeps Dockerfile digests current; the Compose template's images need a manual or scripted bump.
- [ ] Upload the Trivy results as SARIF to code scanning, so findings below the gate are visible in the Security tab.

## 9. First production deployment

These are the deployment readiness blockers, once items 1, 5 and 6 are done:

- [ ] Configure Authentik with TOTP MFA and validate the real outpost URL.
- [ ] Run authenticated and unauthenticated smoke tests against the final DNS names and TLS certificates.
- [ ] Document secret rotation and vault access, set up the host firewall, and write the rollback procedure: repin the previous digest and rerun `site.yml`.
- [ ] Add a post-deploy check to `site.yml` that waits for every service to report healthy.

## 10. Kubernetes as a second deployment target

- [ ] Write Helm charts for `api`, `web` and `admin`, plus PostgreSQL managed by the CloudNativePG operator, using the same images, ports (`8080`/`8000`), health endpoints and runtime config as the Compose deployment.
- [ ] Add an ArgoCD `Application`, demonstrated on kind or k3d. Add CI that runs `helm lint` and `kubeconform` and installs the charts into kind and runs the API e2e test.
- [ ] Keep Compose with Ansible as the supported production path, and document how the two differ.

## Component backlog

Smaller items, by component. Items that need an API change start in `api/` and are coordinated with both frontends.

### `api/`

- [ ] Design the portrait and media contract with `admin/` and `deploy/`: upload authorisation, content type and size validation, metadata, retention and deletion, and delivery. Prefer object storage for the bytes with metadata in the database, unless storing them in PostgreSQL is a deliberate decision. Browsers never query the database directly.
- [ ] Support autocomplete with bounded results and a predictable minimum query length. Benchmark the normalised-name `ILIKE` search on PostgreSQL, and add indexes (for example a `pg_trgm` GIN index) only from measured query plans.
- [ ] Localise validation and error messages only where the clients need it. Stored names and story content stay language-neutral.

### `web/`

- [ ] Localise the interface in Icelandic and English. Keep names and story text as authored, and test labels, validation messages, empty states and narrow layouts in both languages.
- [ ] Show portraits once the API's media contract exists.
- [ ] Replace the landing photograph with one taken in Iceland.

### `admin/`

- [ ] Localise the editor in Icelandic and English, preserving story content as authored. Test validation, loading, save status, history and preview in both languages.
- [ ] Warn before discarding an unsaved story when changing the selected person or starting another page.
- [ ] Add portrait selection and upload once the API's media contract exists. Don't keep image bytes in browser state or imply the feature exists before then.

### `deploy/` (deferred)

Covered by items 6, 7 and 9 above: backups, monitoring, Authentik with TOTP MFA, DNS and TLS smoke tests, secret rotation, firewall and rollback.

### Dependencies

- [ ] Upgrade Vite together with `@vitejs/plugin-react` 6, and jsdom to 30. The Dependabot pull requests for both failed and were closed, so these need code or configuration changes.
- [ ] Move the images, `.nvmrc` and `engines` to the next Node.js LTS line deliberately; Dependabot ignores Node major versions.

Once these priorities are agreed, they can move to GitHub Issues with component labels and a milestone.

## Manual TODOs

Steps that need the repository owner, because they depend on account access or decisions outside the code.

- [ ] **GHCR, after the first release tag:** if the push fails with 403, an archived repository created the package first; grant `steinnhauser/minnumst` Write under _Package settings → Manage Actions access_, then re-run the release job. Then set each `minnumst-*` package to **Public**.
- [ ] **Branch protection level:** `main` blocks force pushes and deletion. Requiring pull requests and the `ci-ok` check as well would stop direct pushes to `main`; decide whether to turn that on.
- [ ] **Production prerequisites (item 9):** the Authentik instance with TOTP MFA and its outpost URL, DNS records for the three hostnames, a monitored ACME e-mail address, and the encrypted `vault.yml`.
