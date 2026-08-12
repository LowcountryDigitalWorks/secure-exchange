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

Focused Release 0.3 checks:

```sh
npm test -- tests/unit/thread-lifecycle.test.ts tests/unit/completion-policy.test.ts
npm test -- tests/integration/workflow-service.test.ts
```

Do not weaken or skip a failed security/quality gate to obtain a green result.

## Project structure

```text
src/
  domain/        provider/framework-independent workflow types and rules
  application/   provider-independent workflow orchestration and ports
  adapters/      provider adapters; Release 0.3 includes local in-memory test/dev persistence only
  http/          Hono HTTP delivery boundary; no business workflow routes in 0.3
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

## Release 0.3 workflow-core implementation

The workflow core now implements:

- lifecycle states `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, `AWAITING_STAFF`, `COMPLETED`, `EXPIRED`, and terminal `DISPOSED`;
- expected-version optimistic concurrency without database-specific concepts;
- completion and disposition timestamps on lifecycle transitions where applicable;
- distinct Opened and Downloaded audit events;
- immutable TransferAttestation records and append-only supersede/invalidate controls;
- completion-policy validation against authoritative current policy and qualifying attestation evidence;
- normalized synthetic actor identity plus authoritative deployment, queue-scope, and action-permission lookup;
- local all-or-nothing mutation + audit/evidence commits.

**Opened != Downloaded != Transferred/Filed != Completed.** No service infers one solely from another.

The in-memory store is intentionally a development/test adapter. Its maps, arrays, lookup helpers, and transaction implementation must not become a production persistence contract.

## Tooling choices

Release 0.3 adds no runtime or development dependency. It uses the Release 0.2 toolchain:

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
- TransferAttestation and audit structures contain only bounded non-sensitive metadata;
- Secretlint is a supplemental control and does not make committing secrets acceptable.

## Release 0.3 deliberate non-goals

Release 0.3 does **not** implement external submission UI/API, staff queue UI, full message/reply workflow, actual file upload, object storage, secure file retrieval, AccessGrant token mechanisms, malware scanning, email notifications, Cognito, SES, S3, DynamoDB, GuardDuty, KMS, API Gateway/Lambda deployment, AWS SDK adapters, infrastructure as code, production authentication, production secrets/configuration, customer integrations, PHI handling, billing, paid services, or production AWS resources.

## Infrastructure

Infrastructure-as-code remains required before real AWS provisioning, but the IaC tool and production resource structure are not selected by Release 0.3.

No production resource should be created manually as a substitute for a reviewed reproducible deployment process.
