# Minnumst

[![CI](https://github.com/steinnhauser/minnumst/actions/workflows/ci.yml/badge.svg)](https://github.com/steinnhauser/minnumst/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

![Minnumst: a written history of our ancestors](docs/assets/minnumst-concept.png)

> _Minnumst_ (Icelandic: "let us remember") is a shared written history of our ancestors, preserving people and their stories across generations.

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

| Folder               | What it is                                                              | Stack                                                                   |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`api/`](api/)       | Shared data API: people and append-only story revisions                 | Python 3.11+, FastAPI, SQLAlchemy, MariaDB (SQLite locally), uv         |
| [`web/`](web/)       | Public, read-only archive with search                                   | React, TypeScript, Vite, Vitest                                         |
| [`admin/`](admin/)   | Editorial desk for creating people and writing story revisions          | React, TypeScript, Vite, Vitest                                         |
| [`deploy/`](deploy/) | Provisioning and deployment to Debian/Ubuntu hosts                      | Ansible, Docker Compose, Traefik, Authentik forward-auth, ansible-vault |
| [`tools/`](tools/)   | Local full-stack Compose environment, sample data, end-to-end API tests | Bash, Make, Docker Compose                                              |

Each service ships as a non-root container image that logs structured JSON. The frontends read their API URL at runtime, so one image works in every environment.
MariaDB is only reachable on an internal network, and secrets live in ansible-vault rather than in the repository.

## Running locally

The root `Makefile` drives every component. Run `make help` for the full list.

```sh
make install       # locked dependencies for api/, web/, admin/ and deploy/
make format        # format everything; format-check, lint, test and build work the same way
make validate      # every component's full validation, as CI runs it (needs Docker)
```

To run the whole stack in containers, rendered from the same Compose template that `deploy/` uses (MariaDB, API and both frontends, without Traefik):

```sh
make stack-test    # build the images, start the stack, wait until ready, seed sample data, run the e2e tests
make down          # stop it; the MariaDB volume is kept
```

The web archive is then on <http://127.0.0.1:5173>, the editorial desk on <http://127.0.0.1:5174> and the API docs on <http://127.0.0.1:8000/docs>. See [`tools/README.md`](tools/README.md) for the details.

Each component also runs on its own with a dev server. Copy its `.env.example` to `.env` first:

```sh
make -C api dev-start      # http://127.0.0.1:8000
make -C web dev-start      # http://127.0.0.1:5173
make -C admin dev-start    # http://127.0.0.1:5174
```

Python is pinned per component in `.python-version` and Node in the root `.nvmrc`; CI uses the same versions as the container images. See [`deploy/README.md`](deploy/README.md) for production deployment.

## CI and releases

[`ci.yml`](.github/workflows/ci.yml) runs on every push and pull request:

| Job            | Checks                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `api`          | Ruff, OpenAPI freshness, pytest on SQLite and on MariaDB (Testcontainers), package build                      |
| `web`, `admin` | Prettier, ESLint, Vitest, TypeScript, production build                                                        |
| `deploy`       | Ruff, ansible-lint, playbook syntax check against the example inventory                                       |
| `tools`        | Ruff and ShellCheck on the helpers, Prettier on docs and workflows                                            |
| `e2e`          | `make stack-test`: builds all three images, starts the stack with MariaDB, seeds data, runs the API e2e tests |

Dependabot keeps npm, uv, Docker base images and GitHub Actions up to date, in weekly grouped pull requests.

Components are versioned independently with Commitizen, and tags are prefixed by component: `api-0.1.2`, `web-0.1.1`, `admin-0.2.1`, `deploy-0.1.0`. Publishing images and GitHub Releases from those tags is the next step.

## History

The project was previously called **Eftirmál**. This repository combines four earlier repositories, `eftirmal-api`, `eftirmal`, `eftirmal-admin` and `eftirmal-deploy`, with their commits kept.
The local tooling in `tools/` was added when they were merged.

## License

[Apache License 2.0](LICENSE)
