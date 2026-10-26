terraform {
  required_version = ">= 1.10"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.70"
    }
  }

  # State lives in Hetzner Object Storage (S3-compatible). The bucket, endpoint
  # and region come from backend.hcl, the access keys from the environment.
  backend "s3" {
    key                         = "minnumst/terraform.tfstate"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }

  # State and plans are encrypted on this machine before they are stored
  # (AES-GCM, key derived with PBKDF2), so the bucket never holds plaintext:
  # not the server's addresses, and not any secret a resource might expose.
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
