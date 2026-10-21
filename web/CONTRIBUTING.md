# Contributing

Thanks for contributing to the Minnumst public frontend. Please discuss substantial changes in an issue before opening a pull request.

## Development

- Use Node.js 20.19 or newer and npm.
- Copy `.env.example` to `.env` for local API configuration. Do not commit secrets or local `.env` files.
- Run `make validate` before submitting changes. This checks formatting, lint, tests, and the production build.
- Add or update focused tests when changing behavior.

## Pull requests

Keep pull requests focused and describe the user-visible change, implementation notes, and checks run. Link related issues and include screenshots for visual changes when useful. Update documentation when behavior or setup changes.

Use Conventional Commit messages, such as `feat: add profile filters`, `fix: handle empty search`, or `docs: clarify setup`. Use `!` or a `BREAKING CHANGE:` footer for incompatible changes.
