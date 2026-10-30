terraform {
  required_version = ">= 1.10"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.70"
    }
  }

  # State lives in infra/terraform.tfstate on the operator's machine, ignored by
  # Git. It and saved plans are encrypted (AES-GCM, key derived with PBKDF2), so
  # the disk never holds plaintext: not the server's addresses, and not any
  # secret a resource might expose.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}
