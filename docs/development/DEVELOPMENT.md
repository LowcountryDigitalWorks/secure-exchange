# Development Conventions

## Approved implementation direction

When implementation begins:

- language: strict TypeScript;
- initial server runtime: Node.js 24;
- HTTP layer: thin Hono-style Web-standards-oriented routing/middleware;
- frontend: semantic HTML/CSS plus small TypeScript modules initially;
- state store: DynamoDB reference adapter;
- domain/business logic: independent of Hono, Lambda, browser presentation, and AWS SDKs.

A large frontend framework is not prohibited. It requires evidence that product complexity justifies the dependency and architectural surface.

## Expected project layering

A future implementation should separate at least:

- domain;
- application/use cases;
- provider adapters;
- HTTP delivery;
- web presentation;
- tests.

Exact directories are deferred to the engineering-baseline release.

## Package/tooling direction

The implementation ADR recommends:

- npm with committed lockfile;
- TypeScript compiler in strict mode;
- small build/bundling tooling;
- Vitest for unit/integration testing;
- Playwright for browser/responsive tests;
- axe-core for automated accessibility checks.

These packages are not added in Release 0.1.

## Repository hygiene

- LF line endings;
- UTF-8;
- final newline;
- no generated build artifacts committed unless explicitly required;
- no `.env` or secret-bearing files;
- synthetic fixtures only.

## Branch and PR workflow

Meaningful changes use branch -> PR -> validation -> review -> squash merge.

Protected `main` is authoritative.

Before changing code:

- inspect current `main`;
- inspect open/recent PRs;
- inspect docs and ADRs;
- inspect workflows/tests/dependencies;
- identify the current source of truth.

## Dependency changes

Every new runtime dependency requires a clear purpose and should be evaluated for maintenance, security, size, licensing, portability, and whether the standard platform can do the job instead.

## Infrastructure

Infrastructure-as-code is expected before real AWS provisioning, but the tool and structure are not selected in Release 0.1.

No production resource should be created manually as a substitute for a reviewed reproducible deployment process.

## Synthetic data

Development names, addresses, messages, documents, organizations, and identifiers must be fictional and must not reproduce real customer/PHI content.

## Documentation persistence

Important architecture/security decisions belong in the repository, especially ADRs, deployment notes, recovery/rollback instructions, ownership boundaries, and release history as those artifacts are introduced.
