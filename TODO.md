# Minnumst Roadmap

Open work only, roughly in priority order within each area. Finished work is in the Git history and the components' changelogs. Item numbers are stable, because other documents refer to them.

**Current focus:** seeding the archive and launching the public site (item 12), then items 6, 7 and 9.

## 1. Releases and repository settings

- [ ] Sign images keylessly with cosign, if a consumer needs signatures beyond the provenance attestation.
- [ ] Optional follow-up: after an image release, open a PR that bumps the matching pin in `vars.yml` (Dependabot can't update GHCR references in Ansible variables).
- [ ] Require pull requests and the `ci-ok` check on `main` (see the manual TODOs; it would end direct pushes).

## 5. Database migrations and roles

- [ ] Use TLS between the API and PostgreSQL if the database ever leaves the internal `backend` network (for example a managed database).

## 6. Backups with a tested restore

- [ ] Copy the encrypted dumps off the host (restic, rclone or the provider's object storage); see the manual TODOs.
- [ ] Measure and document RPO (24 hours today) and RTO once the first real restore has been timed.

## 7. Monitoring, alerting and request tracing

- [ ] Add Prometheus, Grafana and Alertmanager to the Compose template as an optional profile. Alert on host availability, container health, `/readyz`, disk space and certificate expiry. Keep the Traefik dashboard private.
- [ ] Add request correlation IDs across Traefik, the frontends' servers and the API's JSON logs, plus route and database metrics. Keep the logging rules: no bodies, query values, credentials or slugs.
- [ ] Ship Grafana dashboards as code in `deploy/`.

## 9. Production hardening

- [ ] Raise the Lynis index further (malware scanning, compiler restrictions) where it doesn't conflict with running containers.
- [ ] Define Traefik's shared middlewares somewhere that doesn't depend on the API container, so restarting the API can't take the public archive down with it.
- [ ] Run Traefik and the Docker API proxy as non-root users where their images allow it.
- [ ] Ship logs (journal, audit, containers) off the host so the rotated audit logs and container logs survive a compromise (with item 7).

## 10. Kubernetes as a second deployment target

- [ ] Write Helm charts for `api`, `web` and `admin`, plus PostgreSQL managed by the CloudNativePG operator, using the same images, ports (`8080`/`8000`), health endpoints and runtime config as the Compose deployment.
- [ ] Add an ArgoCD `Application`, demonstrated on kind or k3d. Add CI that runs `helm lint` and `kubeconform` and installs the charts into kind and runs the API e2e test.
- [ ] Keep Compose with Ansible as the supported production path, and document how the two differ.

## 11. Provision the host as code (`infra/`)

- [ ] Remote state in an S3-compatible bucket, once more than one machine or person needs it.
- [ ] TFLint with a ruleset for the hcloud provider, if one matures.

## 12. Data sourcing: census import and source links

Fill the archive from open sources while keeping to the [data protection rules](README.md#data-protection-and-sources).

- [ ] Parent and partner relationships, and a short summary in our own words on each source.
- [ ] Server-side search in the admin desk before the census import: it loads everyone at once today, which won't work for 226,864 people.
- [ ] Import script in `tools/` for [ICE-ID](https://huggingface.co/datasets/goldpotatoes/ice-id) (licence and National Archives position to be confirmed: the dataset card says MIT, the paper CC BY 4.0): pinned dataset revision and checksum, idempotent, dry run by default. Only the 226,864 linked people are imported, rule 1 is applied, and relatives who fail it are left out. A report lists how many were imported and how many skipped, and why.
- [ ] Source links on profiles: prefilled search links to timarit.is (name and patronym within the person's lifetime), manntal.is and gardur.is. Editors confirm each match in the admin desk; nothing is attached automatically.
- [ ] Dates of death after 1920 from gardur.is or confirmed obituaries, so that people born after 1898 become eligible only when a death is recorded.
- [ ] Ask the National and University Library (timarit.is) and the National Archives (manntal.is, heimildir.is) about metadata or API access before building anything that fetches pages automatically. Respect robots.txt and the terms of use.

## `api/`

- [ ] Design the portrait and media contract with `admin/` and `deploy/`: upload authorisation, content type and size validation, metadata, retention and deletion, and delivery. Prefer object storage for the bytes with metadata in the database, unless storing them in PostgreSQL is a deliberate decision. Browsers never query the database directly.
- [ ] Support autocomplete with bounded results and a predictable minimum query length. Benchmark the normalised-name `ILIKE` search on PostgreSQL, and add indexes (for example a `pg_trgm` GIN index) only from measured query plans.
- [ ] Localise validation and error messages only where the clients need it. Stored names and story content stay language-neutral.

## `web/`

- [ ] Show portraits once the API's media contract exists.

## `admin/`

- [ ] Let editors mark a version "do not restore" when text was removed at a family's request or for privacy. Today a warning covers this.

- [ ] Localise the editor in Icelandic and English, preserving story content as authored. Test validation, loading, save status, history and preview in both languages.
- [ ] Add portrait selection and upload once the API's media contract exists. Don't keep image bytes in browser state or imply the feature exists before then.

## Dependencies

- [ ] TypeScript 7 (the native compiler) once `typescript-eslint` supports it.
- [ ] Move the images, `.nvmrc` and `engines` to the next Node.js LTS line deliberately; Dependabot ignores Node major versions.

## Guardrails for public suggestions

Suggestions need no login, and that stays: visitors never get accounts, because the archive won't hold personal data about them. Every suggestion is reviewed before publication. Today's limits are a per-address rate limit and body size limit at the edge, field limits in the API, and a cap of 500 waiting suggestions. If spam or bad actors appear, add in this order:

- [ ] A hidden trap field for simple bots.
- [ ] An alert to editors when suggestions arrive; today only a count in the desk shows them.
- [ ] A rate limit per IPv6 /64 network, not just per address.
- [ ] A proof-of-work challenge that involves no third party, or a privacy-respecting CAPTCHA as a last resort.
