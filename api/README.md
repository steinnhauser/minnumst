# Minnumst API

The FastAPI service that owns people and their append-only story revisions. It is the only component that touches the database: MariaDB in deployment, SQLite for local development. Both frontends read and write through it.

Setup, checks and the local stack are documented in the [repository README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md). From the repository root:

```sh
cp api/.env.example api/.env
make dev-api          # http://127.0.0.1:8000, interactive docs at /docs
make test-api         # SQLite-backed tests
make test-mariadb     # the same writes and reads against MariaDB in a container
make openapi          # regenerate api/openapi.json after changing routes or schemas
```

## Contract

The checked-in contract is [`openapi.json`](openapi.json). `make openapi-check` and the test suite fail when it no longer matches the application.

| Route                                        | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/people?query=&offset=0&limit=50`   | Search people by name (accent-insensitive), one page at a time |
| `POST /api/people`                           | Create a person                                                |
| `GET /api/people/{person_id}`                | Read a person with their current story                         |
| `PATCH /api/people/{person_id}`              | Rename a person                                                |
| `DELETE /api/people/{person_id}`             | Delete a person who has no story; `409` otherwise              |
| `GET /api/people/by-slug/{slug}`             | Read a person and their current story by public slug           |
| `GET /api/people/{person_id}/blog`           | Read the story                                                 |
| `PUT /api/people/{person_id}/blog`           | Save a new revision (creates the story on first save)          |
| `GET /api/people/{person_id}/blog/revisions` | The full revision history, newest first                        |
| `GET /healthz`, `GET /readyz`                | Liveness, and readiness including the database                 |

- Names are unique after normalisation (accents and whitespace), enforced by a database constraint. Each person has at most one story.
- Every save appends an immutable revision. There are no routes to edit, delete or restore revisions, and a person with a story can't be deleted.
- Writes rely on Traefik and Authentik in front of the API: `POST`, `PUT`, `PATCH` and `DELETE` are routed through forward-auth. The API itself has no login.

## Configuration

| Variable       | Default                   | Purpose                                                                                |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `sqlite:///./minnumst.db` | SQLAlchemy URL, e.g. `mysql+pymysql://user:pass@mariadb:3306/minnumst?charset=utf8mb4` |
| `CORS_ORIGINS` | empty                     | Comma-separated origins of the two frontends                                           |
| `LOG_LEVEL`    | `INFO`                    | `DEBUG`, `INFO`, `WARNING` or `ERROR`                                                  |

Tables are created on startup (`create_all`); add versioned migrations before changing the schema of a database that holds real data.

Logs are one JSON object per line on stdout. Request records carry a validated `X-Request-ID` (echoed in the response), method, route template, status and duration. Query values, bodies, credentials and slugs are never logged.

## Container image

[`docker/api.Dockerfile`](../docker/api.Dockerfile), built from the repository root. The image runs as a non-root user on port `8000` and uses `/healthz` as its health check.
