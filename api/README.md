# Minnumst API

The FastAPI service that owns people and their append-only story revisions. It is the only component that touches the database: PostgreSQL in deployment, SQLite for local development. Both frontends read and write through it.

Setup, checks and the local stack are documented in the [repository README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md). From the repository root:

```sh
make dev-api          # http://127.0.0.1:8000, interactive docs at /docs
make test-api         # SQLite-backed tests
make test-postgres    # the same writes and reads against PostgreSQL in a container
make openapi          # regenerate api/openapi.json after changing routes or schemas
```

## Contract

The checked-in contract is [`openapi.json`](openapi.json). `make openapi-check` and the test suite fail when it no longer matches the application.

| Route                                        | Purpose                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/people?query=&offset=0&limit=50`   | Search people by name (accent-insensitive), one page at a time                                                            |
| `POST /api/people`                           | Create a person                                                                                                           |
| `GET /api/people/{person_id}`                | Read a person with their current story by ID (see below)                                                                  |
| `PATCH /api/people/{person_id}`              | Rename a person                                                                                                           |
| `DELETE /api/people/{person_id}`             | Delete a person who has no story; `409` otherwise (see below)                                                             |
| `GET /api/people/by-slug/{slug}`             | Read a person and their current story by public slug. Slugs are permanent: a rename keeps the slug, so links keep working |
| `GET /api/people/{person_id}/blog`           | Read just the current story and its revision count (see below)                                                            |
| `PUT /api/people/{person_id}/blog`           | Save a new revision (creates the story on first save)                                                                     |
| `GET /api/people/{person_id}/blog/revisions` | The full revision history, newest first                                                                                   |
| `GET /healthz`, `GET /readyz`                | Liveness, and readiness including the database                                                                            |

- Names are unique after normalisation (accents and whitespace), enforced by a database constraint. Each person has at most one story.
- Every save appends an immutable revision. There are no routes to edit, delete or restore revisions, and a person with a story can't be deleted.
- Three routes have no caller in either frontend, and are kept on purpose:
  - `GET /api/people/{person_id}` is the canonical read by ID. Every mutation takes an ID rather than a slug, so integrations and the end-to-end test use it to check a write.
  - `GET /api/people/{person_id}/blog` returns just the current story and its revision count, without the person or the history.
  - `DELETE /api/people/{person_id}` exists to undo a mistaken create. It removes only a person without a story and answers `409` otherwise; like every write it goes through Authentik. No route edits or deletes stories or revisions.
- Writes rely on Traefik and Authentik in front of the API: `POST`, `PUT`, `PATCH` and `DELETE` are routed through forward-auth. The API itself has no login.

## Configuration

| Variable                | Default                   | Purpose                                                                      |
| ----------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`          | `sqlite:///./minnumst.db` | SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@postgres:5432/minnumst` |
| `CORS_ORIGINS`          | empty                     | Comma-separated origins of the two frontends                                 |
| `LOG_LEVEL`             | `INFO`                    | `DEBUG`, `INFO`, `WARNING` or `ERROR`                                        |
| `DATABASE_RUNTIME_ROLE` | empty                     | For migrations: the PostgreSQL role that receives the API's privileges       |

## Schema and migrations

The schema comes from Alembic migrations in [`src/minnumst_api/migrations/`](src/minnumst_api/migrations/), shipped inside the package, so the image needs no extra files. `python -m minnumst_api.migrate` applies them; in deployment a one-shot `migrate` service runs it before the API starts, and `make dev-api` runs it against SQLite.

Migrations run as a role that owns the schema. They grant the API's runtime role (`DATABASE_RUNTIME_ROLE`) only what it needs: full access to `people`, read, insert and lock on `blog_posts`, and **only `SELECT` and `INSERT` on `blog_revisions`**. Story history is therefore append-only in the database itself, not just in the code: the PostgreSQL test connects as the runtime role and checks that updating or deleting revisions, deleting stories, dropping tables and creating tables are all refused.

After changing the models, run `make migration MESSAGE="describe the change"` to generate the migration, review it, and commit it. A test fails if the migrations and the models ever disagree, and another checks that they downgrade cleanly.

Logs are one JSON object per line on stdout. Request records carry a validated `X-Request-ID` (echoed in the response), method, route template, status and duration. Query values, bodies, credentials and slugs are never logged.

## Container image

[`docker/api.Dockerfile`](../docker/api.Dockerfile), built from the repository root. The image runs as a non-root user on port `8000` and uses `/healthz` as its health check.
