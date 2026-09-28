# Eftirmal Admin

React and Vite workspace for drafting name-linked blog pages for the Eftirmal archive.

## Requirements

- Node.js 20.19 or newer
- npm

## Run locally

```sh
make install
make run-dev
```

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
| `make build`        | Type-check and build the production frontend          |
| `make run-dev`      | Start the Vite development server                     |
| `make preview`      | Preview the production build locally                  |
| `make clean`        | Remove build and coverage output                      |

The matching npm scripts are available directly in `package.json`.

## Current boundary

The central CRUD API is the planned source for profile data, image uploads, and name-linked blog pages. Its endpoint and payload contracts are not available yet, so the current editor stores blog drafts in this browser's local storage. Each normalized person name has one page, and each save adds a revision. These drafts are not shared between browsers or visible on the public site. Do not invent API endpoints or treat display names as durable profile IDs.

The intended admin workflow is to find, review, edit, and create profiles, including submitting profile images through forms to the API. Blog edits must preserve revision history. Image files must be submitted as files through the agreed API contract, not stored as base64 drafts in local storage.

Local environment files are ignored by Git. `.env.example` is the tracked template; only non-secret browser configuration belongs in `DEBUG` and `VITE_API_URL`.

## Checks

```sh
make test
make lint
make build
```
