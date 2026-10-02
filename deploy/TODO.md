# Deployment Roadmap

This backlog is owned by the Ansible/Compose deployment repository. Production host changes are operationally sensitive; use example inventories for validation and require an explicit request before deploying.

## Readiness Blockers

- [ ] Publish public and admin frontend images to GHCR, then replace their `OWNER` placeholders with immutable version tags. Their current workflows publish build archives, not images; the API image alone is currently published by its API tag workflow.
- [ ] Provision/configure the external Authentik instance and its Google Authenticator-compatible TOTP MFA flow. The Compose template already routes the admin host and API write methods through Authentik forward-auth; validate the real outpost URL, policies, session flow, and that unauthenticated writes are rejected while public reads remain available.
- [ ] Confirm the final production DNS names (including `admin.eftirmal.is`), TLS issuance, and Traefik routing with authenticated and unauthenticated smoke tests before exposing the host.

## Operations And Security

- [ ] Add MariaDB backup and restore procedures, including a tested restore and retention policy. Named volumes alone are not backups.
- [ ] Define monitoring/alerting for host availability, container health, database readiness, disk capacity, and certificate renewal. Avoid exposing Traefik's dashboard publicly.
- [ ] Review secret rotation, vault access, host firewall, image pinning, and recovery/rollback steps before the first real deployment.

## Already In Place

- Traefik is installed/configured by Ansible and routes HTTPS services to the Compose network.
- Authentik forward-auth middleware is wired for the admin service and API mutation routes; the Authentik service and MFA policy are external prerequisites.
- MariaDB is on an internal Compose network and has a health check; it is not published on a host port.
- Run `make validate` before deployment. Never substitute the example inventory or credentials for production values.
