# Minnumst infrastructure

[OpenTofu](https://opentofu.org) creates the host on Hetzner Cloud; [`deploy/`](../deploy/) then hardens it and runs the stack. Run every command from the repository root.

| Resource          | Purpose                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `hcloud_server`   | Ubuntu Server 24.04 LTS with IPv4 and IPv6, daily Hetzner snapshots, protected against deletion and rebuilds |
| `hcloud_firewall` | Only SSH (from `ssh_source_ips`), HTTP, HTTPS and ICMP reach the server: a second layer in front of nftables |
| `hcloud_volume`   | The data volume for Docker (PostgreSQL, certificates) and the backups; `deploy/` encrypts it with LUKS2      |
| `hcloud_ssh_key`  | The administrator's key; cloud-init creates that user and nothing else                                       |

## Security

- **Encrypted state.** OpenTofu encrypts the state and every saved plan with AES-GCM before they leave your machine (key derived from `TF_VAR_state_passphrase` with PBKDF2), and refuses to read or write them unencrypted. The state bucket never holds plaintext.
- **No secrets in files.** The Hetzner API token (`HCLOUD_TOKEN`), the Object Storage keys and the state passphrase come from the environment. `terraform.tfvars` and `backend.hcl` are ignored by Git; only their examples are tracked.
- **Data at rest.** Hetzner Cloud images can't be installed with LUKS, so the data lives on a separate volume that `deploy/` encrypts (NIST SP 800-53 SC-28). Its key is on the root disk, readable by root only, so the volume unlocks at boot: that protects the data when the volume is detached, snapshotted or retired, not against someone who already controls the running host.
- **Defence in depth.** The Hetzner firewall drops everything but SSH, HTTP, HTTPS and ICMP before it reaches the host; nftables on the host does the same again. Restrict `ssh_source_ips` to known networks where you can.
- **Guard rails.** The server and the volume have deletion protection, and changes to cloud-init or the image never replace the server. `make lint` checks formatting, validates the configuration and scans it with Trivy.

## Using it

Once: create a Hetzner Cloud project with an API token (read and write), an Object Storage bucket with access keys for the state, and a passphrase (`openssl rand -base64 32`) kept in a password manager. Then:

```sh
cp infra/backend.hcl.example infra/backend.hcl          # bucket, region and endpoint
cp infra/terraform.tfvars.example infra/terraform.tfvars  # your SSH public key
export HCLOUD_TOKEN=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… TF_VAR_state_passphrase=…

make infra-plan        # review what will change
make infra-apply       # apply exactly that plan
make infra-inventory   # write deploy/inventory/hosts.ini, including the data volume
```

If the key is already registered in the Hetzner project as `minnumst-admin`, the first apply would fail because Hetzner rejects duplicate keys. Import it once before planning, using the same public key in `terraform.tfvars`:

```sh
tofu -chdir=infra init -input=false -backend-config=backend.hcl
tofu -chdir=infra import hcloud_ssh_key.admin "$(curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  'https://api.hetzner.cloud/v1/ssh_keys?name=minnumst-admin' | jq -r '.ssh_keys[0].id')"
```

Point the A and AAAA records of the three hostnames at the addresses `tofu -chdir=infra output` prints, then continue with [`deploy/README.md`](../deploy/README.md). The generated inventory names the data volume, so `make deploy` encrypts it and keeps Docker's data and the backups there.

To remove everything, first lift the deletion protection on the server and the volume in the Hetzner console. That step is deliberately manual.
