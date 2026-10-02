# Contributing

Thanks for contributing to the Eftirmal API. Please discuss substantial changes in an issue before opening a pull request.

## Development

- Use Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).
- Copy `.env.example` to `.env`; never commit credentials or local environment files.
- Run `make format-check`, `make lint`, `make check-openapi`, and `make test` before submitting changes. Run `make validate` when Docker is available; it also runs MariaDB integration tests and builds the package.
- Add or update focused tests for API behavior and preserve backward compatibility unless a breaking change is intended.
- Keep blog history immutable: saves append revisions rather than replacing prior content.

## Pull requests

Keep pull requests focused and describe the API or data contract change, implementation notes, and checks run. Link related issues and update `api/openapi.json` with `make generate-openapi` when routes, schemas, or API metadata change.

Use Conventional Commit messages, such as `feat: add people search filters`, `fix: validate blog revisions`, or `docs: clarify local setup`. Use `!` or a `BREAKING CHANGE:` footer for incompatible changes.
