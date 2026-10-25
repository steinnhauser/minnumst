# Static server

Shared by the `web` and `admin` images ([`docker/frontend.Dockerfile`](../../docker/frontend.Dockerfile)); it is not published.

- [`server.mjs`](server.mjs) serves `./dist` of the working directory on `PORT` (default `8080`), falling back to `index.html` for client-side routes. `SERVICE_NAME` labels its logs.
- [`logging.mjs`](logging.mjs) writes one JSON object per line with a request ID (from a valid `X-Request-ID` or a new UUID), method, sanitised route, status and duration. `LOG_LEVEL` is `DEBUG`, `INFO`, `WARNING` or `ERROR`. Query strings and slugs are never logged.
- [`runtime-config.mjs`](runtime-config.mjs) writes `dist/runtime-config.js` at container start from the environment variables named on its command line (`RUNTIME_CONFIG_KEYS` in the image), so one image works in every environment. The file is public, so only list browser-safe values.
