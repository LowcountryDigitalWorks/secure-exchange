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
