# Secure Exchange

Secure Exchange is a Lowcountry Digital Works product for secure, role-routed message and document exchange between an organization and external participants.

## Current status

**Release 0.4 implements the provider-neutral Conversation & Queue Core Prototype.** It extends the Release 0.3 workflow core with synthetic/local queue configuration, accountless external initiation semantics, immutable thread messages, candidate queue views, authoritative staff conversation reads, authorized staff replies, and bounded activity/attention metadata.

Release 0.4 remains an application/domain prototype. It does not expose a production public submission endpoint, finished public or staff UI, production authentication, attachment upload/download, external secure retrieval/reply, AccessGrant secrets, email delivery, AWS adapters, or production infrastructure.

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

Focused workflow tests can be run with:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
npm test -- tests/unit/message.test.ts tests/unit/queue.test.ts tests/unit/thread-activity.test.ts
npm test -- tests/integration/conversation-service.test.ts
```

For a production-style local build/run of the non-sensitive shell:

```sh
npm run build
npm start
```

See [Development conventions](docs/development/DEVELOPMENT.md) for commands, project structure, CI behavior, dependency updates, security rules, and release boundaries.

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

## Conversation and workflow rules

Release 0.4 preserves these independent facts:

**Opened != Downloaded != Transferred/Filed != Completed.**

Queue membership is candidate information only. A queue result or thread identifier never grants content access; authoritative deployment, thread, queue-scope, actor, and action permission checks occur before conversation content is loaded.

Messages are immutable logical communications. Release 0.4 represents synthetic prototype message content as bounded plain text in the provider-neutral domain. That local representation is not an object-storage, encryption, DynamoDB, or production-content-storage contract.

Per-user unread/read-position semantics are intentionally deferred. `NEW`, Opened evidence, last activity, and attention metadata must not be treated as interchangeable unread state.

The local in-memory store is a development/test adapter only. Its maps, arrays, keys, and copy-on-write transaction implementation are not the production persistence contract.

## Authoritative documentation

- [Product purpose and non-goals](docs/PRODUCT.md)
- [MVP and roadmap](docs/MVP_AND_ROADMAP.md)
- [Release 0.4 implementation boundary](docs/releases/0.4-conversation-queue-core.md)
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
