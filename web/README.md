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

The front page shows churches from around the country, one every few seconds, each fading in over the last. Only the first loads with the page; each next one is fetched just before it appears, so visitors download only what they stay to see, and the images have hashed names and are cached for a year. A button pauses them. Visitors who ask for reduced motion or less data start on one still photograph, and a hidden tab fetches nothing. All are from Wikimedia Commons, cropped and resized, with the credit shown on each ([`src/churches.ts`](src/churches.ts)):

- Grafarkirkja, Höfðaströnd: [photograph](https://commons.wikimedia.org/wiki/File:Grafarkirkja_02.jpg) by Syrio, CC BY-SA 4.0
- Búðakirkja, Búðir, Snæfellsnes: [photograph](https://commons.wikimedia.org/wiki/File:Black_Church_and_Mountains_2021-10-04.jpg) by Eric Kilby, CC BY-SA 2.0
- Seyðisfjarðarkirkja, Seyðisfjörður: [photograph](<https://commons.wikimedia.org/wiki/File:The_Blue_Church_in_Sey%C3%B0isfj%C3%B6r%C3%B0ur,_Iceland_(48359468331).jpg>) by Mustang Joe, CC0
- Þingvallakirkja, Þingvellir: [photograph](https://commons.wikimedia.org/wiki/File:Thingvellir_church.jpg) by JD554, CC BY-SA 3.0
- Húsavíkurkirkja, Húsavík: [photograph](https://commons.wikimedia.org/wiki/File:HusavikChurch.jpg) by Andreas Tille, CC BY-SA 4.0
- Saurbæjarkirkja, Rauðisandur: [photograph](https://commons.wikimedia.org/wiki/File:Black_Church_at_Rau%C3%B0isandur.jpg) by Eric Kilby, CC BY-SA 2.0
- Víkurkirkja, Vík í Mýrdal: [photograph](https://commons.wikimedia.org/wiki/File:201708_V%C3%ADkurkirkja_02.jpg) by Jonashtand, CC BY-SA 4.0
- Akureyrarkirkja, Akureyri: [photograph](<https://commons.wikimedia.org/wiki/File:Akureyrarkirkja_-_panoramio_(1).jpg>) by Jon Gretarsson, CC BY-SA 3.0
- Strandarkirkja, Selvogur: [photograph](https://commons.wikimedia.org/wiki/File:Strandarkirkja-Front.jpg) by JNC2, CC BY-SA 4.0
- Stykkishólmskirkja, Stykkishólmur: [photograph](https://commons.wikimedia.org/wiki/File:Stykkisholmur_Church_2019_1.jpg) by Kasa Fue, CC BY-SA 4.0
- Hóladómkirkja, Hólar í Hjaltadal: [photograph](https://commons.wikimedia.org/wiki/File:Holakirkja.jpg) by Michael Scaduto, CC BY-SA 2.0
- Hallgrímskirkja, Reykjavík: [photograph](https://commons.wikimedia.org/wiki/File:Hallgr%C3%ADmskirkja_2018_HDR.jpg) by DimaXmarxist, CC0
