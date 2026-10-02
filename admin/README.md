# Eftirmál | Editorial Desk

![Eftirmál concept: a family tree of stories, names, and memories](.github/assets/eftirmal-concept.png)

> Eftirmál is a shared written history of our ancestors, preserving people and their stories across generations.

This React, TypeScript, and Vite application is the editorial workspace for creating people and saving append-only story revisions through the shared API.

## Requirements

- Node.js 20.19 or newer
- npm

## Run locally

```sh
make install
cp .env.example .env
make dev-start
```

Start the API separately with `make -C ../eftirmal-api dev-start`. The admin frontend runs at `http://127.0.0.1:5174/`, separate from the public site on port 5173. Use `make dev-stop` to stop it. The process ID and output are stored in ignored `.dev-server.pid` and `.dev-server.log` files; override the defaults with `DEV_HOST` and `DEV_PORT`.

Vite reads `DEBUG` and `VITE_API_URL` from `.env`. Copy `.env.example` to `.env` to start with the documented local settings. `DEBUG=true` shows a local debug indicator; it does not implement or bypass authentication. Authentication is handled upstream by Traefik and Authentik.

## Commands

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `make install`      | Install npm dependencies                              |
| `make format`       | Format source, configuration, and documentation files |
| `make format-check` | Check formatting without writing changes              |
| `make lint`         | Run ESLint                                            |
| `make test`         | Run the Vitest suite once                             |
| `make test-watch`   | Run Vitest in watch mode                              |
| `make validate`     | Run formatting, lint, tests, and production build     |
| `make build`        | Type-check and build the production frontend          |
| `make dev-start`    | Start Vite in the background                          |
| `make dev-stop`     | Stop the process started by `make dev-start`          |
| `make preview`      | Preview the production build locally                  |
| `make clean`        | Remove build and coverage output                      |

The matching npm scripts are available directly in `package.json`.

## Container Image

The Dockerfile builds the Vite bundle and serves it as a non-root user on port `8080`. Set `VITE_API_URL` at build time because Vite embeds the API origin in the static assets:

```sh
docker build --build-arg VITE_API_URL=https://api.example.com -t eftirmal-admin:local .
```

The GitHub workflow publishes tagged frontend build archives as releases; it does not currently publish a container image.

## Current boundary

The central API is the source of truth for people and blog pages. The admin loads people with `GET /api/people`, creates a person with `POST /api/people` when needed, saves edits with `PUT /api/people/{person_id}/blog`, and loads history from `GET /api/people/{person_id}/blog/revisions`. The API assigns stable person IDs, enforces one blog per person, and appends an immutable revision on every save. The public frontend reads the current revision from the same API.

The current API supports person creation, name updates, public lookup, and blog revisions. It does not yet define profile image upload or revision restore routes; do not simulate those operations in this frontend.

Local environment files are ignored by Git. `.env.example` is the tracked template; only non-secret browser configuration belongs in `DEBUG` and `VITE_API_URL`.

## Checks

Run the complete local checks with `make validate`.
