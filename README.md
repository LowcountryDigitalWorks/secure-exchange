# Secure Exchange

Secure Exchange is a Lowcountry Digital Works product for secure, role-routed message and document exchange between an organization and external participants.

## Current status

**Release 0.2 establishes the executable engineering baseline only.** It adds the approved TypeScript/Node/Hono toolchain, automated validation, and a minimal non-sensitive engineering shell. Secure Exchange business workflows and production AWS infrastructure are not implemented.

This repository is public. Development must use synthetic examples only. Do not commit customer data, PHI, credentials, secrets, private operational details, or production configuration.

Secure Exchange must not be represented as HIPAA compliant merely because it uses encryption, secure links, or AWS services. Any regulated deployment requires a documented end-to-end compliance and operational boundary.

## Development quick start

Required: Node.js 24.x and npm 11.x or 12.x.

```sh
npm ci
npx playwright install chromium
npm run validate
```

For local development:

```sh
npm run dev
```

For a production-style local build/run:

```sh
npm run build
npm start
```

See [Development conventions](docs/development/DEVELOPMENT.md) for commands, project structure, CI behavior, dependency updates, security rules, and Release 0.2 non-goals.

## Product direction

The approved reference direction is:

- one generic Secure Exchange product, not customer-specific forks;
- one isolated deployment per customer in customer-owned infrastructure as the preferred production model;
- provider-neutral domain and workflow semantics;
- AWS-first reference adapters for identity, notification, object storage, execution, encryption, malware scanning, and infrastructure logging;
- Secure Exchange-owned application audit events, lifecycle, retention/disposition, routing, configuration, and UX;
- strict TypeScript with Node.js 24 for the initial server runtime;
- a thin Web-standards-oriented HTTP layer;
- semantic HTML/CSS with small TypeScript modules for the initial frontend;
- DynamoDB as the initial AWS reference state store behind provider-neutral persistence abstractions.

## Authoritative documentation

- [Product purpose and non-goals](docs/PRODUCT.md)
- [MVP and roadmap](docs/MVP_AND_ROADMAP.md)
- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Data flows and trust boundaries](docs/architecture/DATA_FLOW.md)
- [Domain model](docs/architecture/DOMAIN_MODEL.md)
- [State-store access patterns](docs/architecture/ACCESS_PATTERNS.md)
- [Provider adapters](docs/architecture/PROVIDER_ADAPTERS.md)
- [Configuration model](docs/architecture/CONFIGURATION.md)
- [Threat model](docs/security/THREAT_MODEL.md)
- [Authorization model](docs/security/AUTHORIZATION.md)
- [Retention and disposition](docs/security/RETENTION_AND_DISPOSITION.md)
- [Test and security strategy](docs/security/TEST_AND_SECURITY_STRATEGY.md)
- [Development conventions](docs/development/DEVELOPMENT.md)
- [Architecture decision records](docs/adr/README.md)
- [Security policy](SECURITY.md)
- [Contribution conventions](CONTRIBUTING.md)

## Repository workflow

Meaningful changes use:

`branch -> pull request -> validation -> review -> squash merge`

Do not push directly to protected `main`. Do not weaken validation to obtain a green build. Production infrastructure, billing, DNS, email routing, account ownership, or consequential permissions remain explicit approval gates.
