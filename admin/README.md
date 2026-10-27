# Minnumst editorial desk

The React frontend editors use to create and rename people and to write stories. Every save appends a new revision through the API; earlier revisions stay readable in the history tab.

Setup, checks and the local stack are documented in the [repository README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md). From the repository root, with the API running (`make dev-api`):

```sh
make dev-admin        # http://127.0.0.1:5174
```

## API usage

The client in [`src/api.ts`](src/api.ts) loads people with `GET /api/people` (paging through everyone), creates them with `POST /api/people`, renames them with `PATCH /api/people/{person_id}`, saves revisions with `PUT /api/people/{person_id}/blog` and loads history from `GET /api/people/{person_id}/blog/revisions`. Person IDs, never names or slugs, identify the person being changed.

The API has no image upload, revision restore or revision delete routes, so the desk doesn't offer them.

When a call fails, the error message ends with the request's `X-Request-ID` (for example `(request ID: 3f2c…)`), which matches the API's log line, so editors can include it when reporting a problem. If the title, introduction or story has changed since it was last loaded or saved, the desk asks before another page is selected or a new page is started, and the browser warns before the tab is closed or reloaded.

## Configuration

| Variable       | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `VITE_API_URL` | API origin; defaults to `http://127.0.0.1:8000`                         |
| `DEBUG`        | `true` shows a local debug indicator. It doesn't affect authentication. |

Both are public browser configuration, so never put secrets in them. Authentication is handled in front of the app by Traefik and Authentik; there is no in-app login.

## Container image

[`docker/frontend.Dockerfile`](../docker/frontend.Dockerfile) with `APP=admin`, `SERVICE_NAME=minnumst-admin` and `RUNTIME_CONFIG_KEYS="VITE_API_URL DEBUG"`, built from the repository root. It runs like the public archive's image: non-root on port `8080`, configured at runtime, logging JSON lines.
