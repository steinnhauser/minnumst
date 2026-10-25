# Minnumst public archive

The public, read-only React frontend: search the archive and read each person's current story. It has no sign-in.

Setup, checks and the local stack are documented in the [repository README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md). From the repository root, with the API running (`make dev-api`):

```sh
make dev-web          # http://127.0.0.1:5173
```

## API usage

Search calls `GET /api/people?query=…&limit=…` (8 suggestions while typing, 50 results on submit). Selecting a person loads `GET /api/people/by-slug/{slug}` and shows the current revision of their story. The client lives in [`src/api.ts`](src/api.ts).

## Configuration

`VITE_API_URL` is the API origin (not an `/api` path) and defaults to `http://127.0.0.1:8000`. In development, set it in the environment or in `web/.env`. In the container, [`runtime-config.mjs`](../packages/static-server/runtime-config.mjs) writes it to `/runtime-config.js` at start-up, so one image serves every environment.

## Container image

[`docker/frontend.Dockerfile`](../docker/frontend.Dockerfile) with `APP=web` and `SERVICE_NAME=minnumst-public`, built from the repository root. The image serves the build with [`packages/static-server`](../packages/static-server/) as a non-root user on port `8080` and reads `VITE_API_URL` and `LOG_LEVEL` at runtime. Its logs are JSON lines with a request ID, method, sanitised route, status and duration; query strings and slugs are not logged.

The landing photograph is from [Unsplash](https://images.unsplash.com/photo-1551632811-561732d1e306) and is bundled, so the page doesn't depend on an image host.
