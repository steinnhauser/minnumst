# Contributing

Thanks for contributing to Minnumst. Please discuss substantial changes in an issue before opening a pull request.

## Ground rules

- Keep each pull request focused, ideally on one component (`web/`, `admin/`, `api/`, `deploy/` or `tools/`). Describe the change, implementation notes, and the checks you ran. Link related issues.
- Never commit credentials, `.env` files, vault passwords, decrypted secrets, real inventories, or local databases.
- Story history is immutable: every save appends a revision. Don't add routes or UI that overwrite or delete revisions.
- Update documentation when behaviour, setup or operator steps change. Include screenshots for visual changes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with the component as the scope, for example `feat(web): add profile filters`, `fix(api): validate blog revisions` or `docs(deploy): clarify vault setup`.
Use `!` or a `BREAKING CHANGE:` footer for incompatible changes. Each component is versioned separately with Commitizen, and its tags are prefixed with the component name (`api-0.1.2`).

## Checks per component

Run `make -C tools validate` to check everything, or the owning component's target:

| Component        | Requirements                                                | Before submitting                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`           | Python 3.11+, [uv](https://docs.astral.sh/uv/)              | `make validate` (format, lint, OpenAPI freshness, tests, build). `make test-mariadb` needs Docker. Run `make generate-openapi` after changing routes, schemas or API metadata, and keep the change backward compatible unless it's a deliberate breaking change. |
| `web/`, `admin/` | Node.js 20.19+, npm                                         | `make validate` (format, lint, Vitest, type-check, production build). Add focused tests for behaviour changes.                                                                                                                                                   |
| `deploy/`        | Python 3.11+, uv, and the Ansible tools from `make install` | `make validate` (Ruff, ansible-lint, syntax check against the example inventory). Never deploy to a live host as part of validation. Keep the Docker Compose and Traefik architecture.                                                                           |
| `tools/`         | Docker and docker-compose                                   | `make compose-config`. For changes that span components, also run `make compose-up db-seed e2e`.                                                                                                                                                                 |

Copy each component's `.env.example` to `.env` for local development.
