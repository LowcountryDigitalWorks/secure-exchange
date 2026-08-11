# Security Policy

Secure Exchange is security-sensitive software. This repository is public and must never contain regulated or customer-sensitive information.

## Never commit or reproduce

- passwords, MFA codes, passkeys, or recovery codes;
- private keys, API tokens, client secrets, or credentials;
- payment-card information;
- PHI, patient information, or real customer content;
- production configuration that exposes private operational details;
- password-vault exports or secret-bearing logs.

Use synthetic fixtures and synthetic identities only.

## Security design authority

The current security baseline is defined by:

- [Threat model](docs/security/THREAT_MODEL.md)
- [Authorization model](docs/security/AUTHORIZATION.md)
- [Retention and disposition](docs/security/RETENTION_AND_DISPOSITION.md)
- [Test and security strategy](docs/security/TEST_AND_SECURITY_STRATEGY.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Data flows](docs/architecture/DATA_FLOW.md)

Security-sensitive behavior must be enforced server-side. Client-side state, hidden UI controls, queue membership displays, and eventually consistent indexes are never authorization sources.

## Vulnerability handling

Do not place exploit details, real customer examples, secrets, or regulated data in public issues or pull requests. If a private security-reporting channel is established later, this file will be updated with that process.

Until then, security findings should be handled through Lowcountry Digital Works' private business communication channel and tracked publicly only after sensitive details are removed and disclosure is appropriate.

## Regulated deployments

No development or reference architecture alone establishes HIPAA or other regulatory compliance. A regulated deployment requires documented vendor/contractual coverage, access controls, logging, backup/recovery, retention, incident-response, operational responsibilities, and customer-specific configuration.
