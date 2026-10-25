# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/steinnhauser/minnumst/security/advisories/new), not in public issues or pull requests. Include the affected component (`api`, `web`, `admin`, `deploy`), the version or commit, and steps to reproduce.

You can expect an acknowledgement within a week. Fixes are released as a new version of the affected component, and the advisory is published once a fixed version is available.

## Standards

The project follows the CIS Ubuntu Linux 24.04 LTS Benchmark and NIST SP 800-53 Rev. 5 for the host, the CIS Docker Benchmark and NIST SP 800-190 for containers, OWASP ASVS for the web application, and OpenSSF Scorecard practices for the supply chain. The [security and networking section of the README](../README.md#security-and-networking) and the [deployment guide](../deploy/README.md#what-the-playbook-enforces) describe the controls and how CI verifies them.

## Supported versions

Only the latest release of each component (`api-*`, `web-*`, `admin-*`, `deploy-*` tags) receives security fixes.

## Scope

In scope: the code and images in this repository, the Compose template and Ansible playbook in `deploy/`, and the CI workflow. Out of scope: vulnerabilities in third-party services such as Authentik or GitHub themselves, and findings that need a compromised host or administrator credentials.
