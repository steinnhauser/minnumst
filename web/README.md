# Minnumst public archive

The public React frontend: search the archive, read each person's current story and sources, and suggest an edit. It has no sign-in.

Setup, checks and the local stack are documented in the [repository README](../README.md) and [CONTRIBUTING](../CONTRIBUTING.md). From the repository root, with the API running (`make dev-api`):

```sh
make dev-web          # http://127.0.0.1:5173
```

## Languages

The interface is in Icelandic by default and in English under `/en`, chosen by the address, so each language has its own links and nothing is stored in the browser. A link in the header goes to the same page in the other language, and a browser that doesn't list Icelandic among its languages also gets a line in English pointing to the English pages. All interface text is in [`src/i18n.ts`](src/i18n.ts). Names and stories stay as they were written and aren't translated. Icelandic names inflect, so no Icelandic sentence puts a name inside its text, and born and died use the customary `f.` and `d.`, which need no gendered form.

## API usage

Typing at least 3 letters shows up to 8 suggestions, from `GET /api/people?query=…&offset=…&limit=…`. The search button goes to a results page of its own, `/search?q=jon&page=2` (`/en/search` in English), with 25 people to a page and numbered page links, such as `1 2 3 4 … 13`. Shorter searches are explained and never sent; the API refuses them too. Each result is a real link to the person's page, `/people/<slug>`, which loads `GET /api/people/by-slug/{slug}`, shows their dates, current story and sources, and links back to the same page of results. Every page has its own address, which can be shared and bookmarked and works with the back and forward buttons. "Suggest an edit" sends a proposed story or a correction or removal request to `POST /api/people/{person_id}/suggestions`. It needs no login and asks for nothing about the visitor, and nothing changes until an editor accepts it. The client lives in [`src/api.ts`](src/api.ts).

[`src/api.contract.test.ts`](src/api.contract.test.ts) runs that client against an API holding the sample people from `tools/scripts/seed_local_db.py`, read-only: `make contract` (part of `make stack-test`) tests the stack on `http://127.0.0.1:8000`, and `MINNUMST_API_URL=…` points it elsewhere. `make test` skips it.

## Configuration

`VITE_API_URL` is the API origin (not an `/api` path) and defaults to `http://127.0.0.1:8000`. In development, set it in the environment or in `web/.env`. In the container, [`runtime-config.mjs`](../packages/static-server/runtime-config.mjs) writes it to `/runtime-config.js` at start-up, so one image serves every environment.

## Container image

[`docker/frontend.Dockerfile`](../docker/frontend.Dockerfile) with `APP=web` and `SERVICE_NAME=minnumst-public`, built from the repository root. The image serves the build with [`packages/static-server`](../packages/static-server/) as a non-root user on port `8080` and reads `VITE_API_URL` and `LOG_LEVEL` at runtime. Its logs are JSON lines with a request ID, method, sanitised route, status and duration; query strings and slugs are not logged.

The typefaces are Newsreader and Source Sans 3, both under the SIL Open Font License and bundled, so loading the page involves no third party. Colours are tokens in [`src/index.css`](src/index.css), with a dark set for readers who prefer it.

The landing photograph is [Grafarkirkja](https://commons.wikimedia.org/wiki/File:Grafarkirkja_02.jpg) by Syrio, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), resized and credited in the footer. It is bundled, so the page doesn't depend on an image host.
