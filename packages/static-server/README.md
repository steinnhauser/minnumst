# Static server

Shared by the `web` and `admin` images ([`docker/frontend.Dockerfile`](../../docker/frontend.Dockerfile)); it is not published.

- [`server.mjs`](server.mjs) serves `./dist` on `PORT` (default `8080`), falling back to `index.html` for client-side routes. It answers only `GET` and `HEAD`, caches hashed `/assets/` for a year and revalidates everything else. `SERVICE_NAME` labels its logs.
- [`config.mjs`](config.mjs) builds `/runtime-config.js` in memory from the variables named in `RUNTIME_CONFIG_KEYS`, so one image works in every environment and the container filesystem can stay read-only. Every browser receives that script, so only list public values. It also sets the security headers: a same-origin Content Security Policy that allows connections only to the API origin, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy, a restrictive `Permissions-Policy` and cross-origin isolation headers.
- [`logging.mjs`](logging.mjs) writes one JSON object per line with a request ID (from a valid `X-Request-ID` or a new UUID), method, sanitised route, status and duration. `LOG_LEVEL` is `DEBUG`, `INFO`, `WARNING` or `ERROR`. Query strings and slugs are never logged.
