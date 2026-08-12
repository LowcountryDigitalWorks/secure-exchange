# Secure Exchange

Secure Exchange is a Lowcountry Digital Works product for secure, role-routed message and document exchange between an organization and external participants.

## Current status

**Release 0.3 implements the provider-neutral workflow core prototype.** It adds authoritative thread lifecycle/version behavior, distinct workflow evidence, append-oriented `TransferAttestation` semantics, completion-policy enforcement, normalized authorization checks, and local in-memory transaction/persistence adapters used only for deterministic development tests.

Release 0.3 does not add external submission/retrieval APIs or UI, production authentication, file/object handling, email delivery, AWS adapters, or production infrastructure.

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

Focused workflow-core tests can be run with:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
```

For a production-style local build/run of the non-sensitive shell:

```sh
npm run build
npm start
```

See [Development conventions](docs/development/DEVELOPMENT.md) for commands, project structure, CI behavior, dependency updates, security rules, and Release 0.3 boundaries.

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

## Workflow-core rules

Release 0.3 preserves these independent facts:

**Opened != Downloaded != Transferred/Filed != Completed.**

`TransferAttestation` is authenticated staff business evidence. It does not imply completion. Completion is an explicit lifecycle transition that succeeds only after current authorization, authoritative thread/version validation, and configured completion-policy preconditions pass.

The local in-memory store is a development/test adapter only. It is not the production persistence contract.

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

The protected `main` branch requires the GitHub Actions `validate` check. Do not push directly to protected `main` and do not weaken validation to obtain a green build. Production infrastructure, billing, DNS, email routing, account ownership, or consequential permissions remain explicit approval gates.
