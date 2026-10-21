# Minnumst

> *Minnumst* (Icelandic: "let us remember") is a shared written history of our ancestors, preserving people and their stories across generations.

Minnumst has a public archive for reading stories, an editorial desk for writing them, and an API that keeps every story revision.
It is self-hosted with Ansible and Docker Compose behind Traefik, with Authentik guarding everything that writes.

The project was previously called **Eftirmál**. Component READMEs, package names and image names still use that name until the rename is finished.

## Architecture

```text
                 ┌──────────────── Traefik (HTTPS, ACME) ────────────────┐
  readers ──────▶│ web/    public archive (React, read-only)             │
  editors ──────▶│ admin/  editorial desk (React)   ◀── Authentik auth   │
                 │ api/    FastAPI ── MariaDB        ◀── auth on writes  │
                 └───────────────────────────────────────────────────────┘
                   deployed by deploy/ (Ansible, Docker Compose, ansible-vault)
```

| Folder | What it is | Stack |
| --- | --- | --- |
| [`api/`](api/) | Shared data API: people and append-only story revisions | Python 3.11+, FastAPI, SQLAlchemy, MariaDB (SQLite locally), uv |
| [`web/`](web/) | Public, read-only archive with search | React, TypeScript, Vite, Vitest |
| [`admin/`](admin/) | Editorial desk for creating people and writing story revisions | React, TypeScript, Vite, Vitest |
| [`deploy/`](deploy/) | Provisioning and deployment to Debian/Ubuntu hosts | Ansible, Docker Compose, Traefik, Authentik forward-auth, ansible-vault |

Each service ships as a versioned container image. The frontends read their API URL at runtime, so one image works in every environment. All services log structured JSON.

## Running locally

```sh
make -C api install && make -C api dev-start        # http://127.0.0.1:8000 (docs at /docs)
make -C web install && make -C web dev-start        # http://127.0.0.1:5173
make -C admin install && make -C admin dev-start    # http://127.0.0.1:5174
```

Copy each folder's `.env.example` to `.env` first. See [`deploy/README.md`](deploy/README.md) for production deployment.

## History

This repository combines four earlier repositories, `eftirmal-api`, `eftirmal`, `eftirmal-admin` and `eftirmal-deploy`, with their commits kept.
Their release tags are prefixed by component, e.g. `api-0.1.2` and `web-0.1.1`.

## License

[Apache License 2.0](LICENSE)
