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
- [x] Pull request titles must be Conventional Commits with an optional component scope (the `pr-title` job).

### 1.3 Faster CI

- [x] Run everything on pushes to `main`, tags, pull requests, `workflow_dispatch` and a weekly `schedule` (new vulnerabilities in unchanged code and images).
- [x] A `changes` job lets documentation-only changes skip the tests, e2e, host and CodeQL jobs; `ci-ok` treats skipped jobs as passing, and tags, schedules and manual runs always run everything.
- [x] Cache the Docker layers of the `e2e` image builds (Buildx Bake with the GHA cache, one scope per image), so unchanged dependency layers aren't rebuilt on every run.

### 1.4 Container registry and image references

- [x] The first release pushed without registry permission problems.
- [x] The `minnumst-*` packages are public and linked to the repository; images pull without credentials.
- [x] `deploy/inventory/group_vars/all/vars.yml` pins the latest releases (`minnumst-web:0.3.0`, `minnumst-admin:0.4.0`, `minnumst-api:0.3.0`) by digest.
- [ ] Optional follow-up: after an image release, open a PR that bumps the matching pin in `vars.yml` (Dependabot can't update GHCR references in Ansible variables).
- [ ] Decide what happens to the old `eftirmal*` packages: delete them, or keep them private with a description pointing here. Add a pointer to `steinnhauser/minnumst` in the README of each archived repository.

### 1.5 Repository settings for a public repository

- [x] Rulesets: `main` can't be force-pushed or deleted, and release tags (`api-*`, `web-*`, `admin-*`, `deploy-*`) can't be moved or deleted, so a published version always maps to one commit.
- [x] Squash merge only, with the PR title as the commit message, and head branches deleted after merge.
- [x] Secret scanning with push protection, Dependabot security updates, private vulnerability reporting and `.github/SECURITY.md`.
- [ ] Require pull requests and the `ci-ok` check on `main` (see the manual TODOs; it would end direct pushes).

### 1.6 Cut over

- [x] First monorepo releases: `api-0.2.0`, `web-0.2.0`, `admin-0.3.0` and `deploy-0.2.0`, published by the release job as public multi-arch images with provenance and SBOMs, plus GitHub Releases.
- [x] `deploy/` pins the published versions by digest.

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

- [x] Generate TypeScript types from `api/openapi.json` into `packages/api-client` (openapi-typescript, readonly). Both frontends compile against them, and `make openapi-check` fails when the spec or the types are stale.
- [x] Type the mocked responses in `web/src/api.test.ts` (and admin's) against the generated types, so a fixture can't describe a response shape the API doesn't return.
- [x] Declare the error responses in the OpenAPI spec: every route documents its `404` and `409` with a shared `ErrorResponse` model.
- [ ] Make a change to `api/openapi.json` count as a frontend change once path filters exist (item 1.3).

### 2.2 Contract tests against the running API

- [x] A contract suite in `web` (`src/api.contract.test.ts`, skipped unless `MINNUMST_API_URL` is set) calls the real `searchPeople` and `getPersonBySlug` against the seeded stack and checks response shapes against the generated types, empty results, the `404` message, accent-insensitive search (`Sólveig` / `solveig`) and the `limit`/`offset` bounds. `make contract` runs it, as part of `make stack-test` and so the CI `e2e` job.
- [x] The same kind of suite for admin's write calls (`createPerson`, `updatePersonName`, `savePersonRevision`, `loadPersonRevisions`, `loadPeople`); `make contract` removes the people it creates afterwards.

- [x] Keep `tools/scripts/e2e_api.py` as the route-level test. It covers every route in the table above, including `GET /api/people/{id}/blog` and the `X-Request-ID` echo, and fails if a route in the live spec goes uncalled.

### 2.3 Fix the drift found so far

- [x] **API version:** the spec reported a hard-coded `0.1.0`. It now reads the package version, and `make release` regenerates `openapi.json`.
- [x] **Validation errors:** the shared client shows the first validation message instead of a bare status, and the web search input is capped at the API's 255 characters.
- [x] **Result limits:** `web` shows 50 results at a time, with a "Show more people" button that pages through the rest with `offset`. The API's bounds (`limit` 1 to 100, empty `query` returns everyone in name order) are now in the route descriptions.
- [x] **Slugs and profile URLs:** slugs are permanent public identifiers (a rename keeps the slug), and every profile has its own address, `/people/<slug>`, that works with links, bookmarks and the back and forward buttons; unit and browser tests cover it.
- [x] **Unused routes:** no client calls `GET /api/people/{id}`, `GET /api/people/{id}/blog` or `DELETE /api/people/{id}`; the route descriptions and `api/README.md` say why each exists (ID-based reads for integrations and the e2e test, the current story alone, and undoing a mistaken create, which only works without a story and goes through Authentik). No UI offers to delete stories or revisions.
- [x] **Request IDs:** every request carries an `X-Request-ID`, and client errors keep the ID (from the response) so a report can be matched to a log line. The admin desk shows it in every error message.
- [x] **Cross-origin admin writes:** the admin client sends credentials, so the Authentik session cookie reaches the API's hostname, and the API allows credentials for its configured origins only (tested, including that unlisted origins get no CORS headers). Reads send no `Content-Type`, so they need no preflight.

### 2.4 Process

- [x] Document the contract-change workflow in CONTRIBUTING: change the API, regenerate the spec, regenerate the client types, then update the clients and the contract tests, all in one PR.

**Done when:** every route has a client caller covered by a contract test against the real API, or a documented reason to exist; both frontends use generated types; and CI fails when the spec, the generated types or a client fall out of step.

## 3. Keep the rename complete and guarded

- [x] `make lint` (and so CI) fails on the old name outside the changelogs, the README History section and this file.
- [x] Naming follows one scheme: `minnumst.org` is the real domain (the repository's website), inventories and examples use `minnumst.example` and the local stack `minnumst.local`; the OpenAPI title is "Minnumst API", page titles read `<page> | Minnumst`, the runtime-config key is `window.__MINNUMST_ENV__`, and services log as `minnumst-api`, `minnumst-admin` and `minnumst-public` (named for the Compose service, `public`, rather than the `minnumst-web` image).
- [x] The GitHub repository description, website (`https://minnumst.org`) and topics, including `monorepo` and `github-actions`, are set.

## 4. Browser end-to-end tests and test quality gates

- [x] Playwright tests against the running stack (`make browser`, in the CI `e2e` job), at desktop and phone widths: a reader searching and reading a story, an editor writing two revisions and seeing both in the history. Any browser console error, including a CSP violation, fails the test.
- [x] axe audits in those flows; the first run found WCAG contrast failures in both frontends, now fixed to AA.
- [x] 100% coverage gates: lines and branches for the API, and lines, statements, branches and functions for the frontends and shared packages. `make test` fails below them, and the README's coverage table is generated from the run (`make coverage-readme`; CI fails if it is stale).
- [x] Return the `X-Request-ID` header on unhandled `500` responses too, with a generic JSON body.
- [x] Unhandled `500` responses get the same CORS headers as every other response, so the admin desk can read their status and request ID.
- [x] Browser tests for renaming (the profile address survives it), validation and duplicate-name messages, and keyboard navigation of the search suggestions.

## 5. Database migrations and roles

PostgreSQL replaced MariaDB before the first deployment, for its SCRAM-SHA-256 authentication, role and privilege model, native UUIDs, a fully unprivileged container, and its tooling (Alembic, CloudNativePG for item 10). The API connects with `psycopg` 3.

- [x] Alembic migrations ship inside the API package and replace `create_all`. A one-shot `migrate` service applies them before the API starts; `make migration MESSAGE=…` generates new ones; tests check that the migrations match the models and downgrade cleanly.
- [x] Separate roles: a migration role owns the schema; the API's runtime role gets only the privileges it needs, with `blog_revisions` insert-only. The PostgreSQL test proves the runtime role can't rewrite or delete revisions or change the schema, and the edge test asserts the API doesn't connect as the owner.
- [ ] Use TLS between the API and PostgreSQL if the database ever leaves the internal `backend` network (for example a managed database).

## 6. Backups with a tested restore

- [x] Nightly `pg_dump` from a hardened systemd timer, encrypted with age to an off-host public key, 14 days kept on the encrypted disk; `minnumst-restore` for restores; `make backup-test` (in the CI `e2e` job) restores a dump into a fresh database and compares the data.
- [ ] Copy the encrypted dumps off the host (restic, rclone or the provider's object storage); see the manual TODOs.
- [ ] Measure and document RPO (24 hours today) and RTO once the first real restore has been timed.

## 7. Monitoring, alerting and request tracing

- [ ] Add Prometheus, Grafana and Alertmanager to the Compose template as an optional profile. Alert on host availability, container health, `/readyz`, disk space and certificate expiry. Keep the Traefik dashboard private.
- [ ] Add request correlation IDs across Traefik, the frontends' servers and the API's JSON logs, plus route and database metrics. Keep the logging rules: no bodies, query values, credentials or slugs.
- [ ] Ship Grafana dashboards as code in `deploy/`.

## 8. Harden the write boundary and the supply chain

- [x] Edge tests: the `e2e` job runs the production Compose template with Traefik and a stand-in forward-auth, and `tools/scripts/e2e_edge.sh` proves that the editorial desk and every write method need authentication, reads stay public, HTTP redirects to HTTPS, HSTS and the CSP are sent, and the API rate limit holds. It also asserts from the rendered production file that only Traefik publishes ports, PostgreSQL and the Docker API proxy sit on internal networks, and every container is hardened.
- [x] Security headers: a same-origin CSP, `frame-ancestors 'none'`, `nosniff`, referrer, permissions and cross-origin policies from the static server; HSTS and the same basics for every route from Traefik. `trustForwardHeader` stays `true` because Traefik is the edge: it already discards client-sent `X-Forwarded-*` headers, so it only passes its own to Authentik.
- [x] Container hardening: read-only root filesystems, no capabilities, `no-new-privileges`, log rotation, root-owned code, no package managers in runtime images, OS fixes applied at build, and a Docker API proxy instead of the socket for Traefik.
- [x] Supply chain: actions pinned to commit SHAs, job-scoped permissions, `persist-credentials: false`, zizmor in `make lint`, CodeQL (security-extended) for Python, TypeScript and the workflow, dependency review on pull requests, Dependabot with a seven-day cooldown, and a Trivy gate on fixable high and critical image vulnerabilities before any release.
- [x] Base images in `docker/` are pinned by digest, and Dependabot keeps the digests current. Third-party images in the Compose template stay on version tags so their patch releases arrive on deploy.
- [x] Trivy results go to code scanning as SARIF (one category per image). The first upload showed a critical and 31 high unfixed vulnerabilities in the API's Debian 12 base; after moving to Alpine, all three images scan clean.

## 9. First production deployment

- [x] Host hardening: `deploy/` is three roles (`host`, `docker`, `minnumst`). The host role enforces the CIS Ubuntu 24.04 benchmark and NIST SP 800-53 controls on Ubuntu Server 24.04 LTS, and refuses to run without full-disk encryption. CI applies it to an Ubuntu 24.04 VM, checks idempotence and reports the Lynis index (57 → 70).
- [x] AIDE file integrity with a daily check (CIS 6.3), local account policy (CIS 5.3, 5.4), debsums, process accounting and sysstat.
- [ ] Raise the Lynis index further (malware scanning, compiler restrictions) where it doesn't conflict with running containers.
- [ ] Ship logs (journal, audit, containers) off the host so the rotated audit logs and container logs survive a compromise (with item 7).
- [x] Authentik in the stack, configured by a blueprint (domain-level forward auth, mandatory TOTP, two allowed groups), on its own database and role, included in the backups, and tested in CI.
- [x] Post-deploy smoke test in the `minnumst` role, run from the controller against the real hostnames: HTTPS with HSTS, public reads, authentication on the desk and on writes.
- [x] Secret rotation (vault, PostgreSQL roles, SSH) and rollback (image pins, `migrate downgrade`) are documented in `deploy/README.md`.

## 10. Kubernetes as a second deployment target

- [ ] Write Helm charts for `api`, `web` and `admin`, plus PostgreSQL managed by the CloudNativePG operator, using the same images, ports (`8080`/`8000`), health endpoints and runtime config as the Compose deployment.
- [ ] Add an ArgoCD `Application`, demonstrated on kind or k3d. Add CI that runs `helm lint` and `kubeconform` and installs the charts into kind and runs the API e2e test.
- [ ] Keep Compose with Ansible as the supported production path, and document how the two differ.

## 11. Provision the host as code (`infra/`)

OpenTofu with the `hetznercloud/hcloud` provider, one environment, no Terragrunt (it pays off with many environments; here it would only add a layer).

- [x] `infra/` creates the Ubuntu 24.04 server (IPv4 and IPv6, Hetzner snapshots, deletion and rebuild protection), the admin SSH key, a Hetzner firewall allowing only 22 (from `ssh_source_ips`), 80, 443 and ICMP, and an unformatted data volume.
- [x] Data at rest: the `host` role encrypts the data volume with LUKS2, mounts it at `/srv/minnumst`, and moves Docker's data and the backups onto it; Docker won't start without it. The encryption check accepts it in place of an encrypted root. CI tests this on a loop device.
- [x] Minimal cloud-init (the administrator only), local state with OpenTofu's enforced state and plan encryption, credentials only in the environment.
- [x] `make infra-inventory` writes the Ansible inventory, including the data volume, from `tofu output`.
- [x] `make lint` (and CI) runs `tofu fmt -check`, `tofu validate` and Trivy's IaC scan; plans and applies stay manual (`make infra-plan`, `make infra-apply`).
- [ ] Remote state in an S3-compatible bucket, once more than one machine or person needs it.
- [x] DNS records as code: an optional `hcloud_zone`, with the real names and records kept in the ignored `terraform.tfvars`.
- [ ] TFLint with a ruleset for the hcloud provider, if one matures.

## 12. Data sourcing: census import and source links

Fill the archive from open sources while keeping to the [data protection rules](README.md#data-protection-and-sources). Every step enforces rule 1: only people who died more than five years ago, or, with no known date of death, people born at least 128 years before the current year.

- [ ] Data model (Alembic migration, `openapi.json`, both frontends): optional birth and death dates or years, parent and partner relationships, and a `person_sources` table (URL, source, title, date, short summary in our own words, licence).
- [ ] The API rejects creating or importing a person who fails rule 1, and the admin desk explains the rejection. Tests cover the boundary years.
- [ ] Import script in `tools/` for [ICE-ID](https://huggingface.co/datasets/goldpotatoes/ice-id) (CC BY 4.0, with attribution): pinned dataset revision and checksum, idempotent, dry run by default. Only the 226,864 linked people are imported, rule 1 is applied, and relatives who fail it are left out. A report lists how many were imported and how many skipped, and why.
- [ ] Source links on profiles: prefilled search links to timarit.is (name and patronym within the person's lifetime), manntal.is and gardur.is. Editors confirm each match in the admin desk; nothing is attached automatically.
- [ ] Dates of death after 1920 from gardur.is or confirmed obituaries, so that people born after 1898 become eligible only when a death is recorded.
- [ ] A removal and correction request route for relatives (contact address in the public archive, handled by editors).
- [ ] Ask the National and University Library (timarit.is) and the National Archives (manntal.is, heimildir.is) about metadata or API access before building anything that fetches pages automatically. Respect robots.txt and the terms of use.

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
- [x] Warn before discarding an unsaved story when changing the selected person or starting another page.
- [ ] Add portrait selection and upload once the API's media contract exists. Don't keep image bytes in browser state or imply the feature exists before then.

### `deploy/` (deferred)

Covered by items 6, 7 and 9 above: backups, monitoring, Authentik with TOTP MFA, DNS and TLS smoke tests, secret rotation, firewall and rollback.

### Dependencies

- [x] Upgrade to Vite 8 with `@vitejs/plugin-react` 6, jsdom 30 and `@eslint/js` 10.
- [ ] TypeScript 7 (the native compiler) once `typescript-eslint` supports it.
- [ ] Move the images, `.nvmrc` and `engines` to the next Node.js LTS line deliberately; Dependabot ignores Node major versions.

Once these priorities are agreed, they can move to GitHub Issues with component labels and a milestone.
