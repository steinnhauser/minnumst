# Eftirmal API

FastAPI service for the public Eftirmal directory and the separate admin frontend. MariaDB is the intended shared database in Docker Compose; SQLite is the local development default.

## Run locally

Requirements: Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```sh
cp .env.example .env
make install
make run-dev
```

The API is available at `http://127.0.0.1:8000`, with interactive documentation at `/docs`. Use `make stop` to stop the background development server. Override `DEV_HOST` and `DEV_PORT` when starting it.

## Database

Set `DATABASE_URL` in the API service environment. For MariaDB in the same Compose network, use a URL like:

```text
mysql+pymysql://eftirmal:password@mariadb:3306/eftirmal?charset=utf8mb4
```

Keep credentials in the deployment secret mechanism, not in tracked files. The application creates tables on startup for this initial implementation; introduce versioned migrations before applying schema changes to a production database.

Set `LOG_LEVEL` in `.env` to `DEBUG`, `INFO`, `WARNING`, or `ERROR`; the default is `INFO`. Other values are rejected during settings validation.

## Initial API contract

- `GET /api/people?query=...&offset=0&limit=50` searches public people by name and returns a page of results.
- `POST /api/people`, `GET /api/people/{person_id}`, and `PATCH /api/people/{person_id}` create, read, and update person names.
- `DELETE /api/people/{person_id}` removes a person only when no blog history exists; otherwise it returns `409`.
- `GET /api/people/by-slug/{slug}` returns a public person and their current blog revision.
- `GET /api/people/{person_id}/blog` reads the person's blog; `PUT` creates it or saves a new revision.
- `GET /api/people/{person_id}/blog/revisions` returns the complete revision history in reverse chronological order.
- `GET /healthz` checks process liveness; `GET /readyz` checks database connectivity.

Person names are normalized for uniqueness using the same accent-insensitive, whitespace-normalized rule as the current admin draft model. A database uniqueness constraint enforces one person per normalized name. Each person has at most one blog row, also enforced by a database constraint. Saving a blog appends an immutable snapshot; it never overwrites an earlier revision.

The current public frontend only implements name search, and the current admin draft editor supplies a person's name, page title, optional introduction, and story. Profile attributes, image upload/storage, and blog delete/restore behavior are not represented yet. A person with blog revisions cannot be hard-deleted, and there is no route to delete revisions. Mutating routes also rely on deployment-level access control: protect them behind the existing Traefik/Authentik boundary before exposing the API.

## Commands

`make install`, `make format`, `make format-check`, `make lint`, `make test`, `make test-mariadb`, `make generate-openapi`, `make check-openapi`, `make validate`, `make build`, `make run-dev`, `make stop`, and `make clean` use UV and Ruff. Cleanup removes the local virtual environment and generated build/test output; it does not remove the local SQLite database or checked-in API specification.

`make test` runs the fast SQLite-backed endpoint suite and verifies the checked-in OpenAPI document is current. `make test-mariadb` starts a disposable `mariadb:11.4` container using Testcontainers and exercises admin writes followed by public reads. It requires Docker access and may need to download the image the first time. Keep it as a separate check for local/CI environments with a Docker daemon.

`make validate` runs the non-mutating format check, Ruff lint, OpenAPI freshness check, all SQLite and MariaDB tests, and the package build. It requires Docker access for the MariaDB test. The validation OpenAPI check fails without modifying the committed file if it is stale.

Run `make generate-openapi` after changing routes, schemas, or API metadata. It serializes FastAPI's generated OpenAPI document deterministically to `api/openapi.json`; `make check-openapi` checks it without writing, and the drift test also verifies the contract.
