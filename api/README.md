# Minnumst | Archive API

![Minnumst concept: a family tree of stories, names, and memories](../docs/assets/minnumst-concept.png)

> Minnumst is a shared written history of our ancestors, preserving people and their stories across generations.

This FastAPI service is the shared data boundary for the public archive and editorial desk. It owns people and immutable blog revisions; MariaDB is used in deployment and SQLite is the local development default.

## Run locally

Requirements: Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```sh
cp .env.example .env
make install
make dev-start
```

The API is available at `http://127.0.0.1:8000`, with interactive documentation at `/docs`. Use `make dev-stop` to stop the background server. The local CORS example allows the public frontend on port 5173 and admin on port 5174. Override `DEV_HOST` and `DEV_PORT` when starting it.

## Database

Set `DATABASE_URL` in the API service environment. For MariaDB in the same Compose network, use a URL like:

```text
mysql+pymysql://minnumst:password@mariadb:3306/minnumst?charset=utf8mb4
```

Keep credentials in the deployment secret mechanism, not in tracked files. The application creates tables on startup for this initial implementation; introduce versioned migrations before applying schema changes to a production database.

Set `LOG_LEVEL` in `.env` or the container environment to `DEBUG`, `INFO`, `WARNING`, or `ERROR`; the default is `INFO`. Other values are rejected during settings validation. The API writes one-line JSON logs to stdout/stderr, so they are available through `docker logs <container>`. Records include timestamp, level, service/logger, and structured request fields. Request records include a validated `X-Request-ID`, method, route template, status, and duration; query values and request bodies are not logged. The API echoes the ID in its response header for correlation. Uvicorn's duplicate access logger is disabled.

## Initial API contract

- `GET /api/people?query=...&offset=0&limit=50` searches public people by name and returns a page of results.
- `POST /api/people`, `GET /api/people/{person_id}`, and `PATCH /api/people/{person_id}` create, read, and update person names.
- `DELETE /api/people/{person_id}` removes a person only when no blog history exists; otherwise it returns `409`.
- `GET /api/people/by-slug/{slug}` returns a public person and their current blog revision.
- `GET /api/people/{person_id}/blog` reads the person's blog; `PUT` creates it or saves a new revision.
- `GET /api/people/{person_id}/blog/revisions` returns the complete revision history in reverse chronological order.
- `GET /healthz` checks process liveness; `GET /readyz` checks database connectivity.

Person names are normalized for uniqueness using an accent-insensitive, whitespace-normalized rule. A database uniqueness constraint enforces one person per normalized name. Each person has at most one blog row, also enforced by a database constraint. Saving a blog appends an immutable snapshot; it never overwrites an earlier revision. The public frontend searches with `GET /api/people` and reads the current story with `GET /api/people/by-slug/{slug}`. The admin loads people, creates people, saves revisions with `PUT /api/people/{person_id}/blog`, and reads revision history from the corresponding `/revisions` route.

The admin supports person-linked blog title, excerpt, and story revisions; profile attributes, image upload/storage, and blog delete/restore behavior are not represented in the current API. A person with blog revisions cannot be hard-deleted, and there is no route to delete revisions. Mutating routes rely on deployment-level access control: protect them behind the existing Traefik/Authentik boundary before exposing the API.

## Container image

Build locally with `docker build -t minnumst-api:local .`. Pushing a plain SemVer API tag runs the release workflow, builds `linux/amd64` and `linux/arm64` images, and publishes `ghcr.io/steinnhauser/minnumst-api:<version>` plus `:latest`. The image listens on port 8000, runs as a non-root user, and exposes `/healthz` as its container healthcheck. Make the GHCR package public in its package settings before pulling it from a host that has not authenticated to GitHub Container Registry.

To rerun publishing for an existing tag without moving or recreating it, manually dispatch the `CI and Release` workflow using that tag as the ref, for example `gh workflow run ci.yml --repo steinnhauser/minnumst --ref api-0.1.0`. Publishing jobs only run when the selected ref is a SemVer tag.

## Commands

`make install`, `make format`, `make format-check`, `make lint`, `make test`, `make test-mariadb`, `make generate-openapi`, `make check-openapi`, `make validate`, `make build`, `make dev-start`, `make dev-stop`, and `make clean` use UV and Ruff. `make run-dev` and `make stop` remain compatibility aliases. Cleanup removes the local virtual environment and generated build/test output; it does not remove the local SQLite database or checked-in API specification.

`make test` runs the fast SQLite-backed endpoint suite and verifies the checked-in OpenAPI document is current. `make test-mariadb` starts a disposable `mariadb:11.4` container using Testcontainers and exercises admin writes followed by public reads. It requires Docker access and may need to download the image the first time. Keep it as a separate check for local/CI environments with a Docker daemon.

`make validate` runs the non-mutating format check, Ruff lint, OpenAPI freshness check, all SQLite and MariaDB tests, and the package build. It requires Docker access for the MariaDB test. The validation OpenAPI check fails without modifying the committed file if it is stale.

Run `make generate-openapi` after changing routes, schemas, or API metadata. It serializes FastAPI's generated OpenAPI document deterministically to `api/openapi.json`; `make check-openapi` checks it without writing, and the drift test also verifies the contract.
