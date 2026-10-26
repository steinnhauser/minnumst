locals {
  labels = { project = var.name, managed-by = "opentofu" }
}

resource "hcloud_ssh_key" "admin" {
  name       = "${var.name}-admin"
  public_key = var.admin_ssh_public_key
  labels     = local.labels
}

# A second layer in front of the host's nftables firewall (deploy/roles/host):
# only SSH, HTTP and HTTPS reach the server at all. NIST SP 800-53 SC-7.
resource "hcloud_firewall" "host" {
  name   = var.name
  labels = local.labels

  rule {
    description = "SSH from the allowed networks"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.ssh_source_ips
  }

  rule {
    description = "HTTP, redirected to HTTPS by Traefik"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "ICMP, for path MTU discovery and diagnostics"
    direction   = "in"
    protocol    = "icmp"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "host" {
  name         = var.name
  image        = "ubuntu-24.04"
  server_type  = var.server_type
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.host.id]
  backups      = var.server_backups
  labels       = local.labels

  # cloud-init only creates the administrator; deploy/ configures the rest.
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    admin_user           = var.admin_user
    admin_ssh_public_key = var.admin_ssh_public_key
  })

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  # Guard against an accidental destroy or rebuild of the production host.
  delete_protection  = true
  rebuild_protection = true

  lifecycle {
    # cloud-init runs once; changing it later must not replace the server.
    ignore_changes = [user_data, ssh_keys, image]
  }
}

# Holds Docker's data (PostgreSQL, ACME state) and the backups. Hetzner Cloud
# images can't be installed with LUKS, so Ansible encrypts this volume instead
# (NIST SC-28); it is left unformatted here for that reason.
resource "hcloud_volume" "data" {
  name              = "${var.name}-data"
  size              = var.data_volume_size
  location          = var.location
  delete_protection = true
  labels            = local.labels
}

resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.host.id
  automount = false
}
