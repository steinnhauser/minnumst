# API Roadmap

This backlog is owned by the FastAPI service, which is the shared data boundary for both frontends and MariaDB. Coordinate client and deployment contracts before changing behavior.

## Before Production Data Growth

- [ ] Introduce a versioned migration system before making production schema changes. Startup currently uses SQLAlchemy `create_all`, which is not a migration/upgrade strategy.
- [ ] Design the ancestor-media contract with the admin and deployment projects: upload authorization, content/size validation, metadata, retention/deletion, and delivery. Prefer object storage for image bytes with database metadata unless a deliberate MariaDB-BLOB decision is made; do not have browsers query MariaDB directly.
- [ ] Define and test the trusted-proxy/authentication boundary for every mutating route. Production relies on Traefik/Authentik, so verify writes cannot bypass that ingress.

## Product And Performance

- [ ] Support autocomplete with bounded results and predictable minimum-query behavior. Benchmark the current normalized-name `ILIKE` search on MariaDB; add indexes or a different search strategy only from measured query plans.
- [ ] Add localized API validation/error behavior only where clients need it; keep stored names and authored story content language-neutral.

## Operations

- [ ] Improve observability with request correlation, non-sensitive structured events, and actionable database/route metrics without logging search terms, story bodies, credentials, or database URLs.
- [ ] Add backup/restore guidance and exercise restore against a disposable MariaDB instance before production data is entrusted to the service.

## Existing Guarantees

- Person names are normalized for uniqueness; each person has at most one blog; writes append immutable numbered revisions.
- `/healthz` and `/readyz`, OpenAPI generation, SQLite tests, and MariaDB integration tests are already present. Preserve them as features evolve.
- Run `make validate` for formatting, lint, OpenAPI freshness, tests, and package build.
