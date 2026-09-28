# Eftirmal Main Frontend

The public-facing Node.js frontend for searching the Eftirmal people archive. The first screen is an English-language name search, with no sign-in flow.

## Requirements

- Node.js 20.19 or newer
- npm

## Getting Started

```sh
make install
make run-dev
```

Vite prints the local development URL when the server starts.

## Commands

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `make format`       | Format source, configuration, and documentation files |
| `make format-check` | Check formatting without writing changes              |
| `make lint`         | Run ESLint                                            |
| `make test`         | Run the Vitest suite once                             |
| `make test-watch`   | Run tests in watch mode                               |
| `make build`        | Type-check and build the production frontend          |
| `make run-dev`      | Start the Vite development server                     |
| `make preview`      | Preview the production build locally                  |
| `make clean`        | Remove build and coverage output                      |

The matching npm scripts are available directly in `package.json`.

## Current Scope

The search form validates input and reports that directory search is not connected yet. It does not issue placeholder network requests. Connect it to the central API once the endpoint, query parameters, and person response shape are agreed. The main frontend is public; admin authentication belongs to the separate admin service.

The landing photograph is bundled locally from [Unsplash](https://images.unsplash.com/photo-1551632811-561732d1e306), so the page does not depend on an image host at runtime.# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
