# Secure Exchange

Secure Exchange is a Lowcountry Digital Works product for secure, role-routed message and document exchange between an organization and external participants.

## Current status

**Release 0.5 implements the Local Development Vertical Slice.** It wires the provider-neutral Release 0.3 workflow core and Release 0.4 conversation/queue core into a disabled-by-default, server-rendered **Synthetic Development Demo** covering accountless synthetic initiation, a server-owned staff queue context, authoritative conversation open/read, chronological messages, and authorized staff reply.

Release 0.5 is a development delivery adapter only. It is not production authentication, a production public portal, a regulated deployment, or production infrastructure. It does not add attachments, external secure retrieval/reply, AccessGrant secrets, email delivery, AWS adapters, or customer integrations.

This repository is public. Development must use synthetic examples only. Do not commit or enter real customer, patient, client, confidential, regulated, or PHI data, credentials, secrets, private operational details, or production configuration.

Secure Exchange must not be represented as HIPAA compliant merely because it uses encryption, secure links, or AWS services. Any regulated deployment requires a documented end-to-end compliance and operational boundary.

## Development quick start

Required: Node.js 24.x and npm 11.x or 12.x.

```sh
npm ci
npx playwright install chromium
npm run validate
```

The functional browser demo is **disabled by default**. Normal local development keeps the engineering shell and `/health` available without exposing `/demo/*` workflow routes.

To enable the synthetic development browser slice explicitly:

```sh
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled npm run dev
```

For a compiled local run:

```sh
npm run build
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled npm start
```

The enabled UI is prominently labeled **Synthetic Development Demo** and is for synthetic data only.

Focused workflow tests can be run with:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
npm test -- tests/unit/message.test.ts tests/unit/queue.test.ts tests/unit/thread-activity.test.ts
npm test -- tests/integration/conversation-service.test.ts
npm test -- tests/unit/reply-eligibility.test.ts tests/integration/reply-lifecycle.test.ts
npm test -- tests/integration/development-demo-http.test.ts tests/integration/same-origin-http.test.ts
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

## Development-browser and workflow rules

Release 0.5 preserves these independent facts:

**Opened != Downloaded != Transferred/Filed != Completed.**

Queue membership is candidate information only. A queue result or thread identifier never grants content access; authoritative deployment, thread, queue-scope, actor, and action permission checks occur before conversation content is loaded.

Staff replies are a provider-neutral business operation. They are allowed only in `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, and `AWAITING_STAFF`, and fail closed in `COMPLETED`, `EXPIRED`, and `DISPOSED`. Replying never automatically transitions lifecycle state.

Messages are immutable logical communications. The synthetic development browser surface renders bounded plain-text message bodies through server-side HTML escaping; message bodies are not copied into queue candidates or audit records.

Browser forms do not supply authoritative thread, message, audit-event, deployment, queue-authorization, or external actor/reference identifiers. The local delivery adapter generates opaque external participant, thread, message, and audit IDs server-side behind an injectable provider-neutral boundary.

The local in-memory store is a development/test adapter only. Its maps, arrays, keys, and copy-on-write transaction implementation are not the production persistence contract. Restarting the local process may reset demo state.

## Authoritative documentation

- [Product purpose and non-goals](docs/PRODUCT.md)
- [MVP and roadmap](docs/MVP_AND_ROADMAP.md)
- [Release 0.5 implementation boundary](docs/releases/0.5-local-development-vertical-slice.md)
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
