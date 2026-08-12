# Development Conventions

## Runtime and package manager

Release 0.2 requires:

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
| `npm run dev` | Run the minimal development shell with TypeScript watch execution |
| `npm run build` | Build the Node.js server bundle into `dist/` |
| `npm start` | Start the compiled engineering shell |
| `npm run format` | Apply Prettier to in-scope engineering files |
| `npm run format:check` | Fail on formatting drift |
| `npm run lint` | Run type-aware ESLint rules |
| `npm run typecheck` | Run strict TypeScript without emitting files |
| `npm test` | Run Vitest unit, integration, and architecture tests |
| `npm run test:e2e` | Run Playwright desktop/mobile Chromium browser tests including axe checks |
| `npm run test:a11y` | Run the axe-tagged Playwright accessibility baseline |
| `npm run security:audit` | Run `npm audit` and fail for high-or-critical findings |
| `npm run security:secrets` | Run Secretlint with the recommended secret-detection preset |
| `npm run validate` | Run the complete Release 0.2 baseline in CI order |

Do not weaken or skip a failed security/quality gate to obtain a green result.

## Project structure

```text
src/
  domain/        provider/framework-independent business domain (empty in 0.2)
  application/   provider-independent use cases; only engineering status in 0.2
  adapters/      infrastructure/provider implementations (empty in 0.2)
  http/          Hono HTTP delivery boundary
  web/           semantic web presentation
  server.ts      Node.js delivery adapter/entry point
scripts/         repository build tooling
tests/
  unit/          deterministic application/domain tests
  integration/   delivery/application integration tests without external services
  architecture/  dependency-boundary regression tests
  e2e/           Playwright browser and accessibility tests
```

Release 0.2 architecture tests enforce that `src/domain` and `src/application` do not acquire Hono, AWS SDK, Node provider APIs, or browser-runtime dependencies. Later feature releases should add business behavior behind these boundaries rather than putting it in HTTP handlers or adapters.

## Tooling choices

The Release 0.1 implementation-stack ADR already authorized npm, strict TypeScript, a small build tool, Vitest, Playwright, and axe-core. Release 0.2 realizes that direction with:

- Hono plus its Node adapter for the thin HTTP shell;
- esbuild for production build validation;
- ESLint with typescript-eslint typed rules;
- Prettier for formatting;
- Vitest for unit/integration/architecture tests;
- Playwright with `@axe-core/playwright` for browser, responsive, and automated accessibility checks;
- Secretlint for local/CI secret detection;
- npm's built-in audit for dependency vulnerability gating.

These are engineering/tooling dependencies, not authorization to implement AWS providers or product workflows.

## CI

`.github/workflows/ci.yml` runs on pull requests to `main` and pushes to release branches. The workflow grants only `contents: read`, installs Node.js 24, uses `npm ci`, installs Chromium for Playwright, then runs `npm run validate`.

The CI job must fail on formatting, lint, type, unit/integration/architecture test, browser/accessibility, build, high-or-critical npm audit, or Secretlint failures.

## Dependency updates

Dependency updates are reviewed changes, not automatic trust decisions.

For any dependency update:

1. verify purpose and maintenance status;
2. review security/licensing/portability implications when material;
3. update `package.json` and `package-lock.json` together;
4. run `npm run validate`;
5. review the resulting PR and CI output.

Do not introduce a major framework, database, authentication product, analytics system, or paid service through an incidental dependency update.

## Repository hygiene and secrets

- LF line endings and UTF-8;
- no generated `dist/`, coverage, Playwright reports, or test results committed;
- no `.env` or secret-bearing files;
- no credentials, private keys, API tokens, customer data, or PHI;
- synthetic fixtures only;
- Secretlint is a supplemental control and does not make committing secrets acceptable.

## Release 0.2 deliberate non-goals

Release 0.2 does **not** implement external submission, secure retrieval, queues, messages, attachments, TransferAttestation, authentication, Cognito, SES, S3, DynamoDB, GuardDuty, KMS, API Gateway/Lambda deployment, AWS SDK adapters, production configuration, customer integrations, PHI handling, billing, or production infrastructure.

The `/health` route and engineering shell exist only to prove the runtime, delivery boundary, build, browser testing, and accessibility toolchain.

## Infrastructure

Infrastructure-as-code remains required before real AWS provisioning, but the IaC tool and production resource structure are not selected by Release 0.2.

No production resource should be created manually as a substitute for a reviewed reproducible deployment process.
