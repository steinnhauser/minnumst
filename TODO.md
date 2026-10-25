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

### 1.1 Release jobs in `ci.yml`

Keep one workflow: add a tag trigger and release jobs to `ci.yml` rather than a second workflow, so a release reuses the exact `checks`, `tests` and `e2e` jobs.

- [ ] Trigger on component-prefixed tags: `api-[0-9]+.[0-9]+.[0-9]+`, `web-…`, `admin-…`, `deploy-…`. Add a `tag` input to `workflow_dispatch` for reruns. A rerun builds the tagged commit; it never builds `main` under an old tag.
- [ ] Have a `release-meta` job parse `<component>-<version>` from the tag and fail if:
  - the component is not one of `api|web|admin|deploy`;
  - the version doesn't match the component's manifest (`api/pyproject.toml`, `web/package.json`, `admin/package.json`, `deploy/pyproject.toml`) and `.cz.yaml`;
  - the tagged commit is not reachable from `main`.
- [ ] Publish only after `checks`, `tests` and `e2e` pass on the tagged commit.
- [ ] Build and push images for `api`, `web` and `admin` (`deploy` has no image):
  - Use `docker/build-push-action` with `context: .`, `file: docker/api.Dockerfile` or `docker/frontend.Dockerfile` with the same build arguments as `tools/compose/local.override.yml`, `platforms: linux/amd64,linux/arm64`, and a GHA build cache scoped per image.
  - Tag them `ghcr.io/steinnhauser/minnumst-<component>:<version>` and `:<major>.<minor>`. Don't publish `latest`: deployments pin exact versions.
  - Add OCI labels: `org.opencontainers.image.source=https://github.com/steinnhauser/minnumst` (this links each package to the repository), plus `version`, `revision` (commit SHA), `title`, `description` and `licenses=Apache-2.0`. The `web` component's image is `minnumst-web`, while its Compose service stays `public`.
  - Generate provenance and SBOM attestations (`provenance: mode=max`, `sbom: true`). Optionally sign keylessly with cosign.
  - Request least-privilege job permissions: `contents: read` by default, `packages: write` and `id-token: write`/`attestations: write` only on the image job, and `contents: write` only on the release job.
- [ ] Create one GitHub Release per tag, titled with the tag (`api 0.1.3`).
  - Take the notes from that component's `CHANGELOG.md` section. `gh release create --generate-notes` lists every PR in the repository since the previous tag, including other components' PRs.
  - Attach the wheel and sdist for `api`, and `minnumst-<component>-<version>.tar.gz` of `dist/` for `web` and `admin`. `deploy` gets a source-only release.
- [ ] Never cancel a running release: give tag runs their own concurrency group per tag, without `cancel-in-progress`.

### 1.2 Versioning and changelogs that respect component boundaries

- [ ] Commitizen works out the next version from every commit since the component's last tag, not only commits that touch that component's folder. So a run of `web` fixes would bump `api` too. Fix this with a helper, `tools/scripts/release.sh <component> [--dry-run]` (plus `make release COMPONENT=api`), that:
  1. refuses to run on a dirty tree or off an up-to-date `main`;
  2. lists the commits since `<component>-<last version>` that touch `<component>/`, and stops if there are none;
  3. derives the increment from only those commits (`feat` → minor, `fix`/`perf` → patch, `!`/`BREAKING CHANGE` → major; minor while the version is `0.x`);
  4. runs `cz bump --increment <X>` in the component folder, which updates the manifest, `.cz.yaml` and `CHANGELOG.md`, and creates the prefixed tag;
  5. prints the push command and doesn't push. Every push is approved by hand.

  Shared files (`docker/`, `packages/static-server/`, the lockfiles) affect several images: count a commit touching `packages/static-server/` or `docker/frontend.Dockerfile` for both `web` and `admin`, and `docker/api.Dockerfile` for `api`.

  The alternative is release-please in manifest mode, which handles monorepos natively and keeps the current tag format (`include-component-in-tag`, `include-v-in-tag: false`). But it needs a PAT or GitHub App, because tags created with `GITHUB_TOKEN` don't trigger other workflows, and it replaces Commitizen. Choose between them before building this step; the helper above is the smaller change.

- [ ] Add Commitizen to the root dev dependency group so the helper runs a pinned version.
- [ ] Add the missing `deploy/.cz.yaml` (`tag_format: deploy-$version`, `version_files: pyproject.toml:version`). `deploy-0.1.0` exists, but `deploy/` can't be bumped right now.
- [ ] Normalise the changelogs once:
  - `api/CHANGELOG.md` mixes Keep a Changelog headings (`## [0.1.1] - …`) with Commitizen output (`## 0.1.2 (…)`) and has `[Unreleased]` at the bottom.
  - Choose the Commitizen format, since it generates the files.
  - Add a line in each changelog marking where the history from the separate repositories ends. Entries such as "Manual reruns for tagged API release and GHCR image publishing workflows" describe workflows that no longer exist.
- [ ] Enforce the scope convention. Add a PR check that the Conventional Commit scope (`fix(api)`) matches the folders the commit touches, and that the PR title is a valid Conventional Commit. With squash merging (1.5), the title becomes the commit on `main` that the release helper reads.

### 1.3 Faster CI

- [ ] Skip work a change can't affect, with a `changes` job (`dorny/paths-filter`): documentation-only changes skip `tests` and `e2e`, and changes outside `api/`, `web/`, `admin/`, `packages/`, `docker/`, `deploy/templates/`, `tools/` and the lockfiles skip `e2e`. `ci-ok` already treats skipped jobs as passing. Run everything on pushes to `main`, on `workflow_dispatch`, and on a weekly `schedule` to catch drift in base images.
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

- [ ] Land 1.1 to 1.5. Then release each component from `main` with the helper: `api-0.1.3`, `web-0.1.2`, `admin-0.2.2` and `deploy-0.1.1` (or whatever increment the commits since the old tags justify). Confirm that each image pulls anonymously and runs non-root on amd64 and arm64.
- [ ] Repin `deploy/`, then remove the "not in place yet" wording from the README "CI and releases" section and `deploy/README.md`.

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

- [ ] **API version:** `FastAPI(title="Minnumst API", version="0.1.0")` is hard-coded in `api/src/minnumst_api/main.py`, while the package is at `0.1.2`, so the published spec reports the wrong version. Read it from the package metadata (`importlib.metadata.version("minnumst-api")`), regenerate `openapi.json`, and add the spec to `version_files` in `api/.cz.yaml` so a bump keeps `make openapi-check` green.
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

- [ ] Replace `create_all` at startup with Alembic. Add a baseline migration that matches the current schema on both MariaDB and SQLite, and test it in CI (upgrade from empty, and a downgrade smoke test).
- [ ] Decide where migrations run in deployment: a one-off `api` container step in `site.yml` before `up`, not on every replica start. Document how to roll back.
- [ ] Do this before any schema change, including the media contract in the component backlog.

## 6. Backups with a tested restore

- [ ] Add a scheduled `mariadb-dump` (or `mariadb-backup`) to `deploy/`, with retention and an off-host copy. Named volumes are not backups.
- [ ] Add a restore playbook or `make` target, plus a CI job that restores a dump into a disposable MariaDB and runs `tools/scripts/e2e_api.py` reads against it.
- [ ] Write the restore runbook in `deploy/README.md`, including the RPO/RTO the setup actually achieves.

## 7. Monitoring, alerting and request tracing

- [ ] Add Prometheus, Grafana and Alertmanager to the Compose template as an optional profile. Alert on host availability, container health, `/readyz`, disk space and certificate expiry. Keep the Traefik dashboard private.
- [ ] Add request correlation IDs across Traefik, the frontends' servers and the API's JSON logs, plus route and database metrics. Keep the logging rules: no bodies, query values, credentials or slugs.
- [ ] Ship Grafana dashboards as code in `deploy/`.

## 8. Harden the write boundary and the supply chain

- [ ] Add tests (in the `e2e` job, with Traefik and a stub forward-auth) proving that every mutating method on the API host goes through Authentik, that reads stay public, and that the API container is not reachable around Traefik. Production relies on Traefik and Authentik for this, so it has to be verified rather than assumed.
- [ ] Review `forwardauth.trustForwardHeader: "true"`, the CORS origins and the security headers (HSTS, CSP, frame-ancestors) set through Traefik middleware.
- [ ] Scan every image built in PRs and releases with Trivy (or Grype). Fail on fixable critical findings and upload SARIF to code scanning.
- [ ] Pin base images by digest (`node:22-alpine@sha256:…`, `python:3.13-slim-bookworm@sha256:…`, `mariadb:11.4@…`, `traefik:v3.3@…`). Let Dependabot keep the digests current.

## 9. First production deployment

These are the deployment readiness blockers, once items 1, 5 and 6 are done:

- [ ] Configure Authentik with TOTP MFA and validate the real outpost URL.
- [ ] Run authenticated and unauthenticated smoke tests against the final DNS names and TLS certificates.
- [ ] Document secret rotation and vault access, set up the host firewall, and write the rollback procedure: repin the previous digest and rerun `site.yml`.
- [ ] Add a post-deploy check to `site.yml` that waits for every service to report healthy.

## 10. Kubernetes as a second deployment target

- [ ] Write Helm charts for `api`, `web` and `admin`, plus an external or operator-managed MariaDB, using the same images, ports (`8080`/`8000`), health endpoints and runtime config as the Compose deployment.
- [ ] Add an ArgoCD `Application`, demonstrated on kind or k3d. Add CI that runs `helm lint` and `kubeconform` and installs the charts into kind and runs the API e2e test.
- [ ] Keep Compose with Ansible as the supported production path, and document how the two differ.

## Component backlog

Smaller items, by component. Items that need an API change start in `api/` and are coordinated with both frontends.

### `api/`

- [ ] Design the portrait and media contract with `admin/` and `deploy/`: upload authorisation, content type and size validation, metadata, retention and deletion, and delivery. Prefer object storage for the bytes with metadata in the database, unless storing them in MariaDB is a deliberate decision. Browsers never query MariaDB directly.
- [ ] Support autocomplete with bounded results and a predictable minimum query length. Benchmark the normalised-name `ILIKE` search on MariaDB, and add indexes or another search strategy only from measured query plans.
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
