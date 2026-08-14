# Secure Exchange

Secure Exchange is a Lowcountry Digital Works product for secure, role-routed message and document exchange between an organization and external participants.

## Current status

**Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype is the currently accepted release.** It implements the Release 0.12 external-delivery design as synthetic/local provider-neutral application state: bounded one-time bootstrap challenges, keyed proof verification, `BootstrapFormGuard`, atomic bootstrap consume plus browser-session creation, one active browser session per AccessGrant, logout/reissue/replacement invalidation, bounded idle/absolute session lifetime, and session-backed external read, attachment-read, and reply authorization.

Release 0.12 remains the accepted production-delivery architecture boundary. The reference flow is a non-secret bootstrap locator plus a user-entered one-time proof, followed by a short-lived server-verified browser session. Browser/session possession does not become application authorization truth; current AccessGrant, thread, operation, lifecycle, and resource authority must still be revalidated.

Release 0.13 does **not** expose a real/public bootstrap route, recipient-facing production UI, production session cookie, notification/email/SMS provider, public-Internet abuse service, production persistence/cloud resources, customer data, or PHI. It does not establish HIPAA or other regulated-production readiness.

The next substantial engineering sequence is **not automatically authorized**. Current portfolio direction requires focused Product Strategy & Business Value validation of the first pilot workflow, willingness to pay, platform/SaaS/OSS alternatives, provider/deployment economics, customer-owned versus LDW-managed deployment, support burden, and regulated operational responsibility before another substantial release.

This repository is public. Development must use synthetic examples only. Do not commit or enter real customer, patient, client, confidential, regulated, or PHI data, credentials, secrets, private operational details, or production configuration.

Secure Exchange must not be represented as HIPAA compliant merely because it uses encryption, secure links, or cloud services. Any regulated deployment requires a separately reviewed end-to-end compliance and operational boundary.

Secure Secrets is outside Secure Exchange and is not part of the current product scope.

## Development quick start

Required: Node.js 24.x and npm 11.x or 12.x.

```sh
npm ci
npx playwright install chromium
npm run validate
```

The functional browser demo is **disabled by default**. Normal local development keeps the engineering shell and `/health` available without exposing `/demo/*` workflow routes.

To enable the synthetic staff/browser development slice explicitly:

```sh
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled npm run dev
```

The existing Release 0.9–0.11 synthetic external retrieval/reply browser adapter requires both development gates:

```sh
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled \
DEMO_EXTERNAL_RETRIEVAL_ENABLED=enabled \
npm run dev
```

For a compiled local run, use the same gate values with `npm start` after `npm run build`.

The enabled UI is prominently labeled **Synthetic Development Demo** and is for synthetic data only. Release 0.13 adds the provider-neutral bootstrap/session core behind the application boundary; it does not silently convert the existing synthetic adapter into a production delivery surface.

Focused workflow tests can be run with:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
npm test -- tests/unit/message.test.ts tests/unit/queue.test.ts tests/unit/thread-activity.test.ts
npm test -- tests/integration/conversation-service.test.ts
npm test -- tests/unit/reply-eligibility.test.ts tests/integration/reply-lifecycle.test.ts
npm test -- tests/integration/development-demo-http.test.ts tests/integration/same-origin-http.test.ts
npm test -- tests/unit/attachment.test.ts tests/integration/attachment-service.test.ts
npm test -- tests/unit/access-grant.test.ts tests/integration/access-grant-service.test.ts tests/integration/attachment-count-concurrency.test.ts
npm test -- tests/unit/external-session-security.test.ts tests/integration/external-session-service.test.ts tests/integration/external-session-invariants.test.ts tests/integration/external-session-replacement.test.ts tests/integration/session-backed-external-access.test.ts tests/integration/session-backed-access-grant-expiry.test.ts
```

See [Development conventions](docs/development/DEVELOPMENT.md) for commands, project structure, CI behavior, dependency updates, security rules, and release boundaries.

## Product direction

The current approved reference direction is:

- one generic Secure Exchange product, not customer-specific forks;
- customer-owned/dedicated infrastructure as the preferred production deployment model, with LDW-managed options only where management creates legitimate value;
- provider-neutral domain, authorization, workflow, and persistence boundaries;
- cloud-first/web-first delivery where practical;
- AWS reference adapters may be used where justified without embedding AWS concepts into the domain layer;
- Secure Exchange-owned application audit events, lifecycle, retention/disposition, routing, configuration, and UX;
- strict TypeScript with Node.js 24 for the initial server runtime;
- a thin Web-standards-oriented HTTP layer;
- semantic HTML/CSS with small TypeScript modules for the initial frontend;
- DynamoDB remains the current initial AWS reference state-store direction behind provider-neutral persistence abstractions.

Provider choice, managed-service responsibility, and regulated-production architecture remain subject to later product, economics, security, and operations gates.

## Authorization, evidence, and workflow invariants

**Opened != Downloaded != Transferred/Filed != Completed.** None is automatically inferred from another.

`THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` are independent AccessGrant operations. Browser-session possession is transport/delivery state only and does not create wildcard authority.

Queue membership is candidate information only. A queue result or thread identifier never grants content access; authoritative deployment, thread, queue-scope, actor, action, AccessGrant, lifecycle, and resource checks occur before protected content or mutation is authorized.

External and staff replies are provider-neutral business operations. Reply eligibility fails closed when lifecycle state disallows reply, and replying never automatically completes or otherwise advances lifecycle state beyond the explicitly modeled activity metadata.

Messages are immutable logical communications. Bounded plain-text message bodies are not copied into queue candidates or workflow audit records.

Attachments remain subject to policy, ownership, integrity, and malware-state checks. Newly ingested content is published as `QUARANTINED`, never `CLEAN`; only validated clean status makes an attachment normally retrievable. `ATTACHMENT_DOWNLOADED` evidence is created only after successful authoritative retrieval.

Raw AccessGrant bearers, bootstrap proofs, bootstrap-verifier key material, `BootstrapFormGuard` values, raw browser-session bearers, session verifiers, message bodies, and attachment bytes are not workflow-audit content.

The local in-memory stores are development/test adapters only. Their maps, arrays, keys, and copy-on-write transaction implementation are not the production persistence contract. Restarting the local process may reset demo state.

## Authoritative documentation

- [Product purpose and non-goals](docs/PRODUCT.md)
- [MVP and roadmap](docs/MVP_AND_ROADMAP.md)
- [Release 0.13 — Bootstrap & Browser Session Core](docs/releases/0.13-bootstrap-session-core.md)
- [Release 0.12 — Production Delivery Boundary](docs/releases/0.12-production-delivery-boundary.md)
- [ADR-0005 — External Bootstrap and Browser Session Boundary](docs/adr/0005-external-bootstrap-session-boundary.md)
- [Release 0.11 — External Reply Development Slice](docs/releases/0.11-external-reply-development-slice.md)
- [Release 0.10 — External Reply Core](docs/releases/0.10-external-reply-core.md)
- [Release 0.9 — External Retrieval Development Slice](docs/releases/0.9-external-retrieval-development-slice.md)
- [Release 0.8 — External Attachment Retrieval](docs/releases/0.8-external-attachment-retrieval.md)
- [Release 0.7 — AccessGrant Core](docs/releases/0.7-access-grant-core.md)
- [Release 0.6 — Attachment Safety Core](docs/releases/0.6-attachment-safety-core.md)
- [Release 0.5 — Local Development Vertical Slice](docs/releases/0.5-local-development-vertical-slice.md)
- [Release 0.4 — Conversation & Queue Core](docs/releases/0.4-conversation-queue-core.md)
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
