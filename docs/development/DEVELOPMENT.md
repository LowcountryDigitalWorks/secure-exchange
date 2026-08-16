# Development Conventions

## Runtime and package manager

Secure Exchange currently requires:

- Node.js 24.x;
- npm 11.x or 12.x.

The required Node major is recorded in `.node-version` and `package.json`. `.npmrc` enables strict engine enforcement. Dependencies use exact versions and `package-lock.json` is committed.

## Install

```sh
npm ci
npx playwright install chromium
```

On Linux environments that need Playwright system dependencies, use:

```sh
npx playwright install --with-deps chromium
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the non-sensitive development shell with TypeScript watch execution |
| `npm run build` | Build the Node.js server bundle into `dist/` |
| `npm start` | Start the compiled development shell |
| `npm run format` | Apply Prettier to in-scope engineering files |
| `npm run format:check` | Fail on formatting drift |
| `npm run lint` | Run type-aware ESLint rules |
| `npm run typecheck` | Run strict TypeScript without emitting files |
| `npm test` | Run Vitest unit, integration, and architecture tests |
| `npm run test:e2e` | Run Playwright desktop/mobile Chromium browser tests including axe checks |
| `npm run test:a11y` | Run the axe-tagged Playwright accessibility baseline |
| `npm run security:audit` | Run `npm audit` and fail for high-or-critical findings |
| `npm run security:secrets` | Run Secretlint with the recommended secret-detection preset |
| `npm run validate` | Run the complete repository validation gate in CI order |

Focused workflow checks:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
npm test -- tests/unit/message.test.ts tests/unit/queue.test.ts tests/unit/thread-activity.test.ts
npm test -- tests/integration/conversation-service.test.ts
```

Do not weaken or skip a failed security/quality gate to obtain a green result.

## Project structure

```text
src/
  domain/        provider/framework-independent workflow, queue, message types and rules
  application/   provider-independent workflow/conversation orchestration and ports
  adapters/      provider adapters; local in-memory test/dev persistence only
  http/          Hono HTTP delivery boundary; no conversation/business routes in 0.4
  web/           semantic development-shell presentation
  server.ts      Node.js delivery adapter/entry point
scripts/         repository build tooling
tests/
  unit/          deterministic domain/policy tests
  integration/   application + local adapter transaction/authorization/isolation tests
  architecture/  dependency-boundary regression tests
  e2e/           Playwright browser and accessibility tests for the development shell
```

Architecture tests enforce that `src/domain` and `src/application` do not acquire Hono, AWS SDK, Node provider APIs, browser-runtime dependencies, or backwards dependencies on adapters/delivery layers.

## Release 0.4 conversation/queue core

Release 0.4 extends—not replaces—the Release 0.3 workflow core with:

- deployment-bound active/inactive queues and bounded routing categories;
- immutable bounded plain-text synthetic Message records;
- thread routing category, last-activity, and attention metadata;
- accountless external initiation through an application-only boundary;
- authorized metadata-only queue candidate listing;
- authoritative staff conversation open/read with chronological messages and distinct Opened evidence;
- authorized immutable staff reply with atomic thread-activity + message + audit commit;
- queue/list and reply permissions while preserving current queue-scope authorization.

**Queue candidate membership is not authorization proof.** Conversation contents load only after authoritative thread authorization.

**Opened != Downloaded != Transferred/Filed != Completed.** No conversation service infers one solely from another.

Per-user unread/read-position state is deferred. `NEW`, Opened evidence, activity, and attention metadata are not interchangeable unread semantics.

The Release 0.4 plain-text message representation and the in-memory store are synthetic development contracts only. They do not select production content storage, encryption, DynamoDB keys, indexes, or transaction expressions.

## Tooling choices

Release 0.4 adds no runtime or development dependency. It uses the Release 0.2 toolchain unchanged:

- Hono plus its Node adapter for the thin development shell;
- esbuild for production build validation;
- ESLint with typescript-eslint typed rules;
- Prettier for formatting;
- Vitest for unit/integration/architecture tests;
- Playwright with `@axe-core/playwright` for browser, responsive, and automated accessibility checks;
- Secretlint for local/CI secret detection;
- npm's built-in audit for dependency vulnerability gating.

`playwright-core` remains pinned directly to the same exact version used by `@playwright/test` to prevent duplicate nominal Playwright type identities through the axe peer dependency.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main` and pushes to release branches. The workflow grants only `contents: read`, disables persisted checkout credentials, installs Node.js 24, uses `npm ci`, installs Chromium for Playwright, then runs `npm run validate`.

Protected `main` requires the `validate` check before merge.

## Dependency updates

Dependency updates are reviewed changes, not automatic trust decisions.

For any dependency update:

1. verify purpose and maintenance status;
2. review security/licensing/portability implications when material;
3. update `package.json` and `package-lock.json` together;
4. review any newly introduced dependency install scripts before allowing them;
5. run `npm run validate`;
6. review the resulting PR and CI output.

Do not introduce a major framework, database, authentication product, analytics system, or paid service through an incidental dependency update.

## Dependency install-script policy

`.npmrc` enables npm's strict install-script policy. A dependency with an unreviewed install-time lifecycle script causes installation to fail rather than being silently trusted.

`package.json` explicitly approves the pinned install-script packages already required by the Release 0.2 toolchain. New or changed install scripts require explicit review and a narrowly pinned `allowScripts` entry. Do not use an allow-all bypass.

## Repository hygiene and secrets

- LF line endings and UTF-8;
- no generated `dist/`, coverage, Playwright reports, or test results committed;
- no `.env` or secret-bearing files;
- no credentials, private keys, API tokens, customer data, or PHI;
- synthetic fixtures only;
- message bodies remain only in message records and never in audit/list rows;
- TransferAttestation and audit structures contain only bounded non-sensitive metadata;
- Secretlint is a supplemental control and does not make committing secrets acceptable.

## Attachment/download evidence boundary

Release 0.4 still does not implement attachment retrieval. Future `ATTACHMENT_DOWNLOADED` evidence must be emitted only by the authoritative successful retrieval path after deployment/thread/attachment ownership, current access authority, lifecycle retrieval eligibility, and malware release state such as `CLEAN` have been validated.

## Release 0.4 deliberate non-goals

Release 0.4 does **not** implement production public submission, finished public/staff UI, production authentication, external secure retrieval/reply, AccessGrant secrets, attachment upload/download, object storage, malware scanning, email notifications, Cognito, SES, S3, DynamoDB, GuardDuty, KMS, API Gateway/Lambda deployment, AWS SDK adapters, infrastructure as code, production sessions/secrets/configuration, rate/bot implementation, customer integrations, PHI handling, billing, paid services, or production AWS resources.

## Infrastructure

Infrastructure-as-code remains required before real AWS provisioning, but the IaC tool and production resource structure are not selected by Release 0.4.

No production resource should be created manually as a substitute for a reviewed reproducible deployment process.

## Release 0.5 local browser slice

Release 0.5 keeps the normal application disabled by default. To enable the synthetic browser vertical slice locally:

\`\`\`sh
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled npm run dev
\`\`\`

or after a build:

\`\`\`sh
npm run build
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled npm start
\`\`\`

Without that exact flag, /demo/* is unavailable while the engineering shell and /health remain available. The local in-memory store may retain demo state for the process lifetime and may reset on restart.

The browser surface is server-rendered HTML/CSS with normal forms and no client-side JavaScript. Application composition injects ConversationService, WorkflowService, the local WorkflowStore, trusted synthetic staff/deployment/queue configuration, an OpaqueIdGenerator, and a clock into createApp().

WebCryptoOpaqueIdGenerator uses Web Crypto randomUUID() only as a local development adapter. Tests inject a deterministic generator. This is not the final production ID design.

Staff reply is a provider-neutral business rule: allowed in NEW, IN_PROGRESS, AWAITING_EXTERNAL, and AWAITING_STAFF; rejected in COMPLETED, EXPIRED, and DISPOSED. Reply does not transition lifecycle state.

Use only synthetic data. Production authentication, external retrieval, attachments, AWS adapters/infrastructure, customer data, PHI, and paid services remain absent.

## Release 0.6 attachment prototype development boundary

Attachment ingestion, scan processing, and retrieval are application/integration-test driven in Release 0.6. The Release 0.5 browser demo has no arbitrary attachment upload/download UI or route.

`InMemoryProtectedContentStore` is development/test-only and may hold cloned synthetic byte arrays in process memory. Do not use real customer/client/patient/regulated data or PHI. Do not substitute disk files, browser localStorage, public URLs, or provider credentials into this prototype.

The attachment policy validates declared metadata only. It is intentionally not a file parser or signature detector. Do not describe a passing filename/MIME/extension policy check as proof of actual content type.

Focused attachment tests:

```sh
npm test -- tests/unit/attachment.test.ts tests/integration/attachment-service.test.ts
```

## Release 0.7 development boundary

Release 0.7 remains application/domain plus synthetic local infrastructure. AccessGrant tests use an injectable clock and Web Crypto secret manager; concrete bearer secrets are generated only at runtime and must never be copied into fixtures, documentation, logs, screenshots, issues, or commits.

The only implemented grant operation is `THREAD_READ`. There is no public retrieval route, email-link generator, external attachment endpoint, or external reply endpoint. Do not add one without a later authorized delivery/security release.

The in-memory WorkflowStore now proves two additional transaction properties: AccessGrant issuance/revocation uses authoritative thread/version and policy checks, and new attachment publication requires a current policy/count guard at commit time. Future persistence adapters must reproduce these invariants using their own conditional/transactional mechanisms without leaking provider-specific concepts into domain/application contracts.

Focused Release 0.7 tests:

```sh
npm test -- tests/unit/access-grant.test.ts
npm test -- tests/integration/access-grant-service.test.ts
npm test -- tests/integration/attachment-count-concurrency.test.ts
```

## Release 0.8 development boundary

External attachment retrieval is application-layer only. Do not add an HTTP route, grant secret in a URL/path/query, capability cookie, email delivery, external reply, cloud persistence adapter, or production identity integration as part of this release.

New retrieval implementations must reuse `retrieveAuthorizedAttachment` after their authority source is established rather than reimplementing attachment ownership, `CLEAN` state, protected-content, byte-length, or download-evidence checks. Provider-specific delivery and storage adapters must remain outside domain semantics.

## Release 0.9 external retrieval development adapter

The existing local workflow demo remains controlled by `SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled`. External retrieval additionally requires `DEMO_EXTERNAL_RETRIEVAL_ENABLED=enabled`; if either gate is absent, `/demo/external/access` routes are not registered. Do not enable this surface on a shared production/public deployment.

The credential form is `GET /demo/external/access` with same-origin `POST /demo/external/access`. Protected development routes are `/demo/external/access/session`, `/conversation`, `/attachments`, POST `/download`, and POST `/end`. There is no HTTP AccessGrant issuance route, email bootstrap, external reply, browser upload, production authentication/session, or production persistence adapter.

Tests may create grants and clean synthetic attachments directly through the application services and then exercise the browser routes. The capability cookie is delivery-only; do not replace per-use AccessGrant validation with cookie presence. Production/public delivery still requires explicit abuse/rate controls and operational review.

## Release 0.10 external reply development boundary

`AccessGrantService.replyExternalConversation()` is an application-only operation. Its untrusted input is limited to deployment/thread/grant selectors, the presented raw bearer secret, and bounded plain-text reply body. The service derives external actor attribution from the validated grant and generates message/audit IDs plus time through existing application boundaries.

External replies are allowed only in `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, and `AWAITING_STAFF`. They do not change lifecycle state. They advance `lastActivityAt` and `attentionAt` to represent new external activity requiring staff attention; `attentionAt` is not per-user unread/read-receipt state.

Do not add an HTTP `/reply` route, reply form/button, client JavaScript, browser upload, email delivery, production authentication/session, or cloud adapter as part of Release 0.10. Release 0.11 must separately review browser reply delivery and same-origin/capability-cookie behavior. No dependency is added in this release.

## Release 0.11 synthetic external reply

External browser reply is available only when both development-only gates are enabled: `SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled` and `DEMO_EXTERNAL_RETRIEVAL_ENABLED=enabled`. The external namespace remains `/demo/external/access`; reply uses `GET /reply`, `POST /reply`, and fixed `GET /reply/sent` confirmation beneath that prefix.

Use synthetic data only. The browser capability remains short-lived transport, not a production session. No production public deployment, identity provider, notification delivery, AWS adapter, customer data, or PHI is part of this slice.

## Release 0.12 architecture/development boundary

Release 0.12 adds **no executable production delivery path**. The Release 0.9–0.11 `/demo/external/access` routes remain synthetic development adapters behind the existing explicit gates and must not be repurposed or enabled as production endpoints.

The production bootstrap/session architecture is documentation-only in this release. Future implementation work must be separately authorized and must preserve [ADR-0005](../adr/0005-external-bootstrap-session-boundary.md) and [External Delivery and Credential Bootstrap Boundary](../architecture/EXTERNAL_DELIVERY_BOUNDARY.md).

### No production secrets or fixtures

Do not add concrete bootstrap proofs, session bearers, AccessGrant bearer values, CSRF secrets, HMAC/bootstrap-verifier keys, notification credentials, provider API keys, private keys, or customer contact/PHI data to local fixtures, screenshots, documentation examples, issues, pull requests, commits, or test output.

Synthetic future tests must inject deterministic fake verifier/key interfaces where needed without copying any real credential material.

### Production configuration is not a demo flag

`SECURE_EXCHANGE_SYNTHETIC_DEMO` and `DEMO_EXTERNAL_RETRIEVAL_ENABLED` remain local/synthetic controls only. A later production implementation must not use these flags as external authentication, authorization, bootstrap assurance, or Internet-exposure controls.

Production delivery policy concepts such as `MAILBOX_ONLY` versus `INDEPENDENT_CHALLENGE`, bootstrap/session lifetimes, concurrency, throttling, and reissue behavior require validated bounded production configuration and cannot be smuggled in as unchecked environment toggles.

### Future implementation order

A later implementation should begin provider-neutral and synthetic/local before any public provider deployment:

1. define bootstrap challenge/session value objects and application-owned ports;
2. implement deterministic in-memory/local adapters and concurrency/replay tests;
3. preserve current AccessGrant revalidation and reply authority guard rather than creating browser-only authorization;
4. implement exact Origin + Fetch Metadata + CSRF mutation controls and defensive response headers;
5. only after those invariants are reviewed should notification, durable state, edge-abuse, and customer-owned provider adapters be separately authorized.

Do not jump directly from this architecture release to a public URL or production provider integration.

### Production infrastructure and ownership

No AWS, Cloudflare, email, identity, state, object, scanner, key-management, DNS, TLS, or customer resource is created by Release 0.12.

Before a real deployment is approved:

- infrastructure must be reproducible and reviewed through the selected IaC process;
- the customer owns runtime data/state/object resources, domain/TLS, keys/secrets/verifier material, notification sender/provider credentials, logs, backups, and customer-specific policy decisions;
- LDW uses named role-based administration and does not require shared credentials;
- backup/restore behavior must prove revoked delivery authority cannot be resurrected and must implement an access/security epoch or equivalent invalidation mechanism if monotonic revocation cannot otherwise be guaranteed;
- public abuse/rate controls must be deployed and validated without becoming application authorization truth.

### Validation for Release 0.12

No runtime test is added merely to restate documentation. This release must keep the complete existing `npm run validate` gate green and receive the normal pull-request-context `validate` check on the frozen candidate.

The future executable invariants created by Release 0.12 are listed in `docs/security/TEST_AND_SECURITY_STRATEGY.md` and become mandatory when implementation is authorized.

Release 0.12 changes no dependency and introduces no recurring cost.

## Release 0.14 synthetic commercial workflow demo

Release 0.14 remains disabled by default. Enable the commercial slice locally only with both development gates:

```sh
SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled \
DEMO_COMMERCIAL_WORKFLOW_ENABLED=enabled \
npm run dev
```

The namespace is `/demo/commercial/*`. `DEMO_COMMERCIAL_WORKFLOW_ENABLED` is independent from the Release 0.9–0.11 `DEMO_EXTERNAL_RETRIEVAL_ENABLED` gate. Do not treat either flag as production authentication, authorization, bootstrap assurance, or Internet-exposure control.

The commercial slice uses server-rendered HTML/CSS and no client-side framework. Intake is bounded to one through four synthetic PDF/PNG/JPEG/text attachments at the current 2 MiB per-file limit. Files always pass through `AttachmentService.ingestAttachment()` as `QUARANTINED` before the demo invokes the existing trusted scan-result transition to `CLEAN`.

`AttachmentService.listStaffAttachmentCandidates()` and `previewStaffAttachment()` are generic application capabilities. They require current STAFF authorization, queue scope, and `ATTACHMENT_READ`; preview and download share the same authoritative message/attachment ownership, exactly-`CLEAN`, protected-content, and byte-integrity resolver. Preview GET is read-only and creates no download evidence. Manual download remains same-origin POST through `retrieveStaffAttachment()` and records the existing successful `ATTACHMENT_DOWNLOADED` event.

Dental-specific fixture data and per-thread patient/mapping/simulation state live only in `SyntheticCommercialWorkflow` under `src/adapters` plus the commercial HTTP/presentation composition. They are not generic domain/application fields and reset with the local process. No real patient creation/search, Open Dental/network/provider SDK, mail delivery, database, analytics, or production persistence is present.

The synthetic completion policy requires an authenticated staff FILED TransferAttestation to the bounded generic `SYNTHETIC_PATIENT_RECORD` destination. A simulated success flag never qualifies by itself. Staff must explicitly confirm simulated filing, explicitly complete, and explicitly dispose.

Use only obviously synthetic fixture values. Do not enter real patient/customer information, PHI, credentials, provider tokens, or production configuration into the demo, tests, screenshots, logs, issues, pull requests, or documentation.

Focused Release 0.14 checks:

```sh
npm test -- tests/unit/synthetic-commercial-workflow.test.ts tests/integration/staff-attachment-preview.test.ts tests/integration/commercial-development-http.test.ts tests/architecture/commercial-demo-boundary.test.ts
npx playwright test tests/e2e/commercial-demo.spec.ts
```

Package version is `0.14.0`; Release 0.14 adds no runtime or development dependency and no expected recurring cost.
