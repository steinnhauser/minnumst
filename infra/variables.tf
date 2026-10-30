variable "state_passphrase" {
  description = "Encrypts the state and plans. Set TF_VAR_state_passphrase; keep it in a password manager."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 32
    error_message = "Use a passphrase of at least 32 characters (for example: openssl rand -base64 32)."
  }
}

variable "name" {
  description = "Prefix for every resource."
  type        = string
  default     = "minnumst"
}

variable "location" {
  description = "Hetzner location (fsn1, nbg1, hel1, …)."
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server type; 2 vCPUs and 4 GB of memory run the stack comfortably."
  type        = string
  default     = "cx23"
}

variable "admin_user" {
  description = "The administrator Ansible logs in as."
  type        = string
  default     = "deployer"
}

variable "admin_ssh_public_key" {
  description = "The administrator's SSH public key (Ed25519 or a hardware key)."
  type        = string

  validation {
    condition     = can(regex("^(ssh-ed25519|sk-ssh-ed25519@openssh.com|ssh-rsa) ", var.admin_ssh_public_key))
    error_message = "Provide an OpenSSH public key, preferably Ed25519."
  }
}

variable "ssh_source_ips" {
  description = "Networks allowed to reach SSH, for example a VPN or office address."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "data_volume_size" {
  description = "Size in GB of the volume that holds the database and backups (encrypted by Ansible)."
  type        = number
  default     = 20
}

variable "server_backups" {
  description = "Hetzner's daily server snapshots, in addition to the database backups."
  type        = bool
  default     = true
}
