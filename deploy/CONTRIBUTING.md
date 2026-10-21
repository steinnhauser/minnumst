# Contributing

Thanks for contributing to the Minnumst deployment configuration. Please discuss substantial changes in an issue before opening a pull request.

## Development

- Use Python 3.11 or newer, [uv](https://docs.astral.sh/uv/), and the Ansible tools installed by `make install`.
- Run `make validate` before submitting changes. This checks formatting, lint, and Ansible syntax using the example inventory.
- Do not include credentials, vault passwords, or decrypted secret values in commits, examples, or logs. Use the repository's Ansible Vault workflow for secrets.
- Keep the existing Docker Compose and Traefik deployment architecture; avoid introducing a replacement reverse proxy.

## Pull requests

Keep pull requests focused and describe affected services, deployment risks, and checks run. Link related issues and update documentation when configuration or operator steps change. Do not run a deployment against a live host as part of validation.
