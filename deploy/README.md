# Minnumst deployment

Ansible hardens a single Ubuntu Server host and runs Minnumst on it with Docker Compose: Traefik, the public archive, the editorial desk, the API and PostgreSQL. The images are built from [`docker/`](../docker/) in this repository. Run every command from the repository root.

The host is configured to the **CIS Ubuntu Linux 24.04 LTS Benchmark** (Level 1 – Server, with selected Level 2 controls). Each task cites its CIS section and the **NIST SP 800-53 Rev. 5** control it implements. The container engine follows the **CIS Docker Benchmark**, and the containers follow **NIST SP 800-190** (Application Container Security Guide). CI applies the host role to a real Ubuntu 24.04 VM on every change, requires the second run to change nothing, and reports the [Lynis](https://cisofy.com/lynis/) hardening index before and after.

## Choosing the host

**Use Ubuntu Server 24.04 LTS, minimal installation.** It is the release with a published CIS benchmark, a DISA STIG and Canonical's Ubuntu Security Guide to audit against both. It gets security support into the 2030s, and Ubuntu Pro (free for personal use on up to five machines) adds Livepatch kernel fixes without reboots. The playbook refuses to run on anything else.

One machine with 2 vCPUs, 4 GB of memory and 40 GB of disk runs the stack comfortably. Pick a provider and region that let you encrypt the disk yourself (see below).

## Setting up the host

These steps happen once, before Ansible can take over:

1. **Install with full-disk encryption** (NIST SC-28). In the Ubuntu Server installer, choose _Use an entire disk_ → _Set up this disk as an LVM group_ → _Encrypt the LVM group with LUKS_. The playbook checks that `/` is on a LUKS volume and refuses to continue otherwise. To unlock the disk after a remote reboot, install `dropbear-initramfs` with your SSH key in `/etc/dropbear/initramfs/authorized_keys`. If a provider can only offer its own disk encryption, set `host_require_disk_encryption: false` and record why.
2. **Create an administrator** with `sudo` rights and an SSH key (Ed25519 or a hardware key), and log in with it once. The playbook disables password and root logins, and checks the key exists first, so it can't lock you out.
3. **Point DNS** for the public, admin and API hostnames at the server, and make sure ports 22, 80 and 443 reach it.
4. **Prepare Authentik** with TOTP multi-factor authentication and a proxy outpost that Traefik can reach (see [Edge](#edge)).

Then configure Ansible:

```sh
cp deploy/inventory/hosts.ini.example deploy/inventory/hosts.ini                          # host and admin user
cp deploy/inventory/group_vars/all/vault.example.yml deploy/inventory/group_vars/all/vault.yml
openssl rand -hex 32                                                                        # once per password
uv run ansible-vault encrypt deploy/inventory/group_vars/all/vault.yml
```

Set the hostnames, ACME e-mail, Authentik outpost URL and image versions in `deploy/inventory/group_vars/all/vars.yml`, and consider restricting SSH to known networks with `host_ssh_allowed_ipv4`/`host_ssh_allowed_ipv6`. `hosts.ini` and `vault.yml` are ignored by Git; keep the vault password outside the repository.

```sh
make deploy                                  # harden the host, install Docker, start the stack
make deploy ARGS="--tags host"               # only the OS hardening (also: docker, app)
make deploy ARGS="--check --diff"            # show what would change
make deploy VAULT_ARGS="--vault-password-file ~/.config/ansible/vault-pass"
```

## What the playbook enforces

[`site.yml`](site.yml) runs three roles: [`host`](roles/host/), [`docker`](roles/docker/) and [`minnumst`](roles/minnumst/). The tunables and their references are in [`roles/host/defaults/main.yml`](roles/host/defaults/main.yml).

| Area                | Control                                                                                                                                                                                             | CIS Ubuntu 24.04 | NIST SP 800-53    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------- |
| Data at rest        | Refuses to deploy unless `/` is on LUKS                                                                                                                                                             | —                | SC-28             |
| Patching            | Full upgrade on every run; unattended security, Ubuntu and Docker updates with an automatic reboot window (04:30); `needrestart` restarts affected services; optional Ubuntu Pro Livepatch/ESM      | 1.2              | SI-2              |
| Least functionality | snapd and legacy clients (telnet, rsh, talk, NIS, FTP, LDAP utils) removed; unused filesystems (cramfs, hfs, udf, usb-storage, …) and protocols (DCCP, SCTP, RDS, TIPC) can't be loaded             | 1.1.1, 2.2, 3.2  | CM-7              |
| Kernel              | ASLR, `kptr_restrict`, `dmesg_restrict`, Yama ptrace scope, unprivileged BPF off, protected links and FIFOs, no SysRq, no core dumps                                                                | 1.5              | SI-16, CM-6       |
| Network stack       | No ICMP redirects or source routing, reverse-path filtering, SYN cookies, martian logging, IPv6 router advertisements ignored                                                                       | 3.3              | SC-5, SC-7        |
| Mounts              | `/dev/shm` mounted `nodev,nosuid,noexec`                                                                                                                                                            | 1.1.2            | CM-6              |
| Mandatory access    | AppArmor enabled; Docker applies its default profile to every container                                                                                                                             | 1.3              | AC-3              |
| SSH                 | Keys only, no root, no passwords, an allow-listed group, three attempts, idle timeout, no forwarding or tunnels, verbose logging, post-quantum hybrid/Curve25519 key exchange and AEAD ciphers only | 5.1              | AC-17, IA-2, SC-8 |
| Privilege           | `sudo` uses a pseudo-terminal and logs to `/var/log/sudo.log`; login banner                                                                                                                         | 5.2, 1.6         | AC-6, AC-8        |
| Firewall            | nftables, default deny for traffic to the host; SSH rate limited and optionally restricted by source; only 80/443 public                                                                            | 4.2              | SC-7              |
| Audit               | auditd rules for identity, sudo, SSH, network, AppArmor, kernel modules, mounts, privilege changes and Docker, immutable until reboot; rotated logs                                                 | 6.2              | AU-2, AU-9, AU-12 |
| Logging and time    | Persistent, compressed, bounded journal; chrony time synchronisation                                                                                                                                | 6.1, 2.3         | AU-4, AU-8        |
| Container engine    | `no-new-privileges` by default, no inter-container traffic on the default bridge, `live-restore`, no userland proxy, bounded logs, audited binaries and directories                                 | Docker 2, 1.1    | CM-6, AU-12       |
| Containers          | Non-root, read-only, no capabilities, internal networks for the database and the Docker API proxy; see the [repository README](../README.md#security-and-networking)                                | Docker 5         | AC-6, SC-7        |

**Deliberate deviations**, each for a reason a reviewer can check:

- **IP forwarding stays on** (CIS 3.3.1) because Docker routes container traffic through the host.
- **squashfs stays loadable** (CIS 1.1.1) because Ubuntu's kernel and recovery tooling can rely on it.
- **Audit logs rotate** instead of `keep_logs` (CIS 6.2.2): on a single host, a full disk is a bigger risk than losing the oldest of ten 50 MB logs. Shipping them off the host is TODO item 7.
- **`/tmp` is not a separate partition** (CIS 1.1.2): partitioning belongs to the installation. Create one in the installer if you want it.

## Edge

Traefik terminates TLS for all three hostnames with Let's Encrypt (HTTP challenge on port 80). The admin host and every API write method go through the Authentik forward-auth endpoint; reads of the public archive and the API stay public. Configure the Authentik proxy provider for the admin and API hostnames. Do not expose the deployment until Authentik is reachable and the login with MFA works.

The application images serve on port 8080 (frontends) and 8000 (API), and take their configuration from Compose at runtime: `VITE_API_URL` for both frontends, `DEBUG` for admin (`minnumst_admin_debug`), and `DATABASE_URL`, `CORS_ORIGINS` and `LOG_LEVEL` for the API. Release tags publish them as `ghcr.io/steinnhauser/minnumst-web`, `minnumst-admin` and `minnumst-api` (see [CONTRIBUTING](../CONTRIBUTING.md#releases)); pin exact versions in `vars.yml`, never `latest`.

PostgreSQL data and Traefik's ACME state live in named volumes. PostgreSQL has no host port. On first start it creates two login roles, neither a superuser: a migration role that owns the database, and the API's runtime role, which can only connect. On every deploy a one-shot `migrate` service applies the migrations as the owner and grants the runtime role only what it needs (revisions are insert-only); the API starts after it succeeds. The vault holds three database passwords: the superuser's, the runtime role's and the migration role's.

## Operations

- **Logs:** every service writes JSON lines. Use `sudo docker compose --project-name minnumst --file /opt/minnumst/compose.yml logs -f api` on the host. `LOG_LEVEL` comes from `minnumst_log_level`.
- **Audit trail:** `sudo ausearch -k sshd`, `-k identity`, `-k docker` and so on, one key per rule group in [`roles/host/files/audit.rules`](roles/host/files/audit.rules).
- **Reboots:** unattended-upgrades reboots at 04:30 when an update needs it. A changed audit rule also marks the host for that reboot, because the rules are immutable until then.
- **Checking the host:** `sudo lynis audit system`, and with Ubuntu Pro, `sudo usg audit cis_level1_server` for a CIS report.

## Development

- `make deploy-check` runs ansible-lint (production profile) and the playbook syntax check; it is part of `make lint`.
- `make stack-config` and `make stack-test` render the Compose template locally and run the whole stack, Traefik included; see [CONTRIBUTING](../CONTRIBUTING.md#local-stack).
- The tooling is versioned as `deploy-<version>` (in `pyproject.toml`). Service images are versioned separately and pinned in the inventory.
