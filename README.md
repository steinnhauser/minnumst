# Minnumst

![Minnumst: a written history of our ancestors](docs/assets/minnumst-concept.png)

> *Minnumst* (Icelandic: "let us remember") is a shared written history of our ancestors, preserving people and their stories across generations.

Minnumst has a public archive for reading stories, an editorial desk for writing them, and an API that keeps every story revision.
It is self-hosted with Ansible and Docker Compose behind Traefik, with Authentik guarding everything that writes.

<p align="center">
  <img src="docs/assets/screenshot-web.jpg" alt="Public archive on desktop: name search with a person's profile and story" width="72%">
  &nbsp;
  <img src="docs/assets/screenshot-mobile.jpg" alt="Public archive on a phone: search result and story" width="22%">
</p>
<p align="center">
  <img src="docs/assets/screenshot-admin.png" alt="Editorial desk: list of pages and the revision history of one story" width="95%">
</p>
<p align="center"><sub>The public archive (desktop and phone) and the editorial desk with a story's revision history. All people and stories shown are fictional sample data.</sub></p>

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
| [`tools/`](tools/) | Local full-stack Compose environment, sample data, end-to-end API tests | Bash, Make, Docker Compose |

Each service ships as a non-root container image that logs structured JSON. The frontends read their API URL at runtime, so one image works in every environment.
MariaDB is only reachable on an internal network, and secrets live in ansible-vault rather than in the repository.

## Running locally

Each component runs on its own:

```sh
make -C api install && make -C api dev-start        # http://127.0.0.1:8000 (docs at /docs)
make -C web install && make -C web dev-start        # http://127.0.0.1:5173
make -C admin install && make -C admin dev-start    # http://127.0.0.1:5174
```

Copy each folder's `.env.example` to `.env` first. To run the whole stack with MariaDB in containers, use the helpers in [`tools/`](tools/):

```sh
make -C deploy install
make -C tools compose-up db-seed e2e
```

`make -C tools validate` runs every component's format, lint, test and build checks. See [`deploy/README.md`](deploy/README.md) for production deployment.

## Releases

Components are versioned independently with Commitizen, and tags are prefixed by component: `api-0.1.2`, `web-0.1.1`, `admin-0.2.1`, `deploy-0.1.0`.
The per-component GitHub Actions workflows under `*/.github/workflows/` come from the separate repositories and do not run here yet. A repository-level CI and release workflow is planned.

## History

The project was previously called **Eftirmál**. This repository combines four earlier repositories, `eftirmal-api`, `eftirmal`, `eftirmal-admin` and `eftirmal-deploy`, with their commits kept.
The local tooling in `tools/` was added when they were merged.

## License

[Apache License 2.0](LICENSE)
