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

| Path                                                 | What it is                                                                         | Stack                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`api/`](api/)                                       | Data API: people and append-only story revisions                                   | Python 3.13, FastAPI, SQLAlchemy, MariaDB (SQLite locally)              |
| [`web/`](web/)                                       | Public, read-only archive with search                                              | React, TypeScript, Vite, Vitest                                         |
| [`admin/`](admin/)                                   | Editorial desk for creating people and writing story revisions                     | React, TypeScript, Vite, Vitest                                         |
| [`packages/static-server/`](packages/static-server/) | Static server, JSON request logs and runtime config shared by both frontend images | Node.js, Pino                                                           |
| [`docker/`](docker/)                                 | Image definitions: one for the API, one for both frontends                         | Docker                                                                  |
| [`deploy/`](deploy/)                                 | Provisioning and deployment to Debian/Ubuntu hosts                                 | Ansible, Docker Compose, Traefik, Authentik forward-auth, ansible-vault |
| [`tools/`](tools/)                                   | Local stack from the deploy Compose template, sample data, end-to-end tests        | Bash, Docker Compose                                                    |

Each service ships as a non-root container image that logs structured JSON. The frontends read their API URL at runtime, so one image works in every environment.
MariaDB is only reachable on an internal network, and secrets live in ansible-vault rather than in the repository.

## Development

This is a monorepo with one toolchain per language: a [uv](https://docs.astral.sh/uv/) workspace for Python (`pyproject.toml`, `uv.lock`, Python version in `.python-version`) and an npm workspace for Node.js (`package.json`, `package-lock.json`, Node.js version in `.nvmrc`). The root [`Makefile`](Makefile) is the entry point; `make help` lists every target.

```sh
make install       # locked Python and Node.js dependencies
make format        # Ruff and Prettier; format-check, lint, test and build work across the repository too
make validate      # everything CI checks except the stack (needs Docker for the MariaDB tests)
```

Run the whole stack in containers, rendered from the same Compose template that `deploy/` uses (MariaDB, API and both frontends, without Traefik):

```sh
make stack-test    # build the images, start the stack, wait until it is ready, seed sample data, run the e2e tests
make down          # stop it; the MariaDB volume is kept
```

The archive is then on <http://127.0.0.1:5173>, the editorial desk on <http://127.0.0.1:5174> and the API docs on <http://127.0.0.1:8000/docs>.

For quicker iteration, run the development servers instead, each in its own terminal: `make dev-api`, `make dev-web` and `make dev-admin`. They work without configuration. [CONTRIBUTING](CONTRIBUTING.md) has the details, and [`deploy/README.md`](deploy/README.md) covers production.

## CI and releases

One workflow, [`ci.yml`](.github/workflows/ci.yml), runs on every push, pull request and release tag, using the same `make` targets:

| Job       | Checks                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `checks`  | Ruff, Prettier, ESLint, ShellCheck, ansible-lint, playbook syntax, OpenAPI freshness, API wheel and frontend builds |
| `tests`   | pytest on SQLite and on MariaDB (Testcontainers), Vitest                                                            |
| `e2e`     | Builds the three images, starts the stack with MariaDB, seeds sample data and runs the end-to-end API tests         |
| `ci-ok`   | Passes only when every other job passed; the single check to require on pull requests                               |
| `release` | On a release tag only: publishes the component's multi-arch image to GHCR and its GitHub Release                    |

Dependabot keeps npm, uv, Docker base images and GitHub Actions up to date, in weekly grouped pull requests.

Each component is versioned on its own, with tags such as `api-0.2.0`. `make release COMPONENT=api` reads the Conventional Commits that touched the component since its last tag, bumps the version, adds a `CHANGELOG.md` section, commits and tags; it never pushes. Pushing the tag runs the checks again and then publishes `ghcr.io/steinnhauser/minnumst-api:0.2.0` (and `:0.2`) for `linux/amd64` and `linux/arm64`, with provenance and an SBOM, plus a GitHub Release with that changelog section. `deploy` releases have no image.

## History

The project was previously called **Eftirmál**. This repository combines four earlier repositories, `eftirmal-api`, `eftirmal`, `eftirmal-admin` and `eftirmal-deploy`, with their commits kept.
They now share one toolchain, one workflow and one license.

## License

[Apache License 2.0](LICENSE)
