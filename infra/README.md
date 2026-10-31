# Minnumst infrastructure

[OpenTofu](https://opentofu.org) creates the host on Hetzner Cloud; [`deploy/`](../deploy/) then hardens it and runs the stack. Run every command from the repository root.

| Resource          | Purpose                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `hcloud_server`   | Ubuntu Server 24.04 LTS with IPv4 and IPv6, daily Hetzner snapshots, protected against deletion and rebuilds |
| `hcloud_firewall` | Only HTTP, HTTPS and ICMP reach the server, plus SSH while it is opened: a second layer in front of nftables |
| `hcloud_volume`   | The data volume for Docker (PostgreSQL, certificates) and the backups; `deploy/` encrypts it with LUKS2      |
| `hcloud_ssh_key`  | The administrator's key; cloud-init creates that user and nothing else                                       |
| `hcloud_zone`     | Optional: the domain's DNS on Hetzner, with its names pointing at the server and its other records           |

## Security

- **Encrypted state.** The state stays on your machine in `infra/terraform.tfstate`, ignored by Git. OpenTofu encrypts it and every saved plan with AES-GCM (key derived from `TF_VAR_state_passphrase` with PBKDF2), and refuses to read or write them unencrypted. Run `make infra-backup` after every apply, and keep a copy off the machine too: without the state, each resource has to be imported again.
- **No secrets in files.** The Hetzner API token (`HCLOUD_TOKEN`) and the state passphrase come from the environment. `terraform.tfvars` is ignored by Git; only its example is tracked.
- **Data at rest.** Hetzner Cloud images can't be installed with LUKS, so the data lives on a separate volume that `deploy/` encrypts (NIST SP 800-53 SC-28). Its key is on the root disk, readable by root only, so the volume unlocks at boot: that protects the data when the volume is detached, snapshotted or retired, not against someone who already controls the running host.
- **Defence in depth.** The Hetzner firewall drops everything but SSH, HTTP, HTTPS and ICMP before it reaches the host; nftables on the host does the same again.
- **SSH is closed by default.** `make ssh open` allows only this machine's current address, and `make deploy` does the same for the length of its run, whichever network you are on. OpenTofu makes the change through the Hetzner API, so the state always matches the firewall, and being locked out of SSH never stops you opening it. Hetzner's web console stays available as well.
- **Guard rails.** The server and the volume have deletion protection, and changes to cloud-init or the image never replace the server. `make lint` checks formatting, validates the configuration and scans it with Trivy.

## Using it

Once: create a Hetzner Cloud project with an API token (read and write), and a passphrase (`openssl rand -base64 32`) kept in a password manager. Then:

```sh
cp infra/terraform.tfvars.example infra/terraform.tfvars  # your SSH public key
export HCLOUD_TOKEN=… TF_VAR_state_passphrase=…

make infra-plan        # review what will change
make infra-apply       # apply exactly that plan
make infra-backup      # copy the encrypted state to ~/.local/share/minnumst/infra-state
make infra-inventory   # write deploy/inventory/hosts.ini, including the data volume
```

Reach the server over SSH with:

```sh
make ssh open          # allow this machine's current address
make ssh status        # can this machine reach SSH?
make ssh close         # closed again; `make deploy` closes it after every run too
```

If the key is already registered in the Hetzner project as `minnumst-admin`, the first apply would fail because Hetzner rejects duplicate keys. Import it once before planning, using the same public key in `terraform.tfvars`:

```sh
tofu -chdir=infra init -input=false
tofu -chdir=infra import hcloud_ssh_key.admin "$(curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  'https://api.hetzner.cloud/v1/ssh_keys?name=minnumst-admin' | jq -r '.ssh_keys[0].id')"
```

Point the hostnames at the server, either by hand with the addresses `tofu -chdir=infra output` prints, or by setting the `dns_*` variables in `terraform.tfvars` (see the example). The zone has no effect until the registrar's nameservers change: first copy every existing record into `dns_records`, apply, compare the answers from a nameserver in the `dns_nameservers` output with the current ones, and only then set those nameservers at the registrar. Hostnames stay in `terraform.tfvars`, not in Git.

Then continue with [`deploy/README.md`](../deploy/README.md). The generated inventory names the data volume, so `make deploy` encrypts it and keeps Docker's data and the backups there.

To remove everything, first lift the deletion protection on the server, the volume and the DNS zone in the Hetzner console. That step is deliberately manual.
