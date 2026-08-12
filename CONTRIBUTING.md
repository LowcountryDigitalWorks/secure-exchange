# Contributing

## Change workflow

Meaningful repository changes use:

1. inspect current `main`, open/recent pull requests, workflows, dependencies, and authoritative documentation;
2. create a scoped branch from current `main`;
3. make only the approved changes;
4. run applicable validation;
5. open a pull request to protected `main`;
6. review and resolve discussion threads;
7. squash merge only after approval.

Do not push directly to protected `main`.

## Local engineering baseline

Required runtime: Node.js 24.x with npm 11.x or 12.x.

Install from the committed lockfile and install the browser used by the baseline:

```sh
npm ci
npx playwright install chromium
```

Run the complete engineering gate before requesting review:

```sh
npm run validate
```

Do not remove, skip, or weaken a failing quality/security check simply to obtain a green result.

## Scope control

Secure Exchange is a generic Lowcountry Digital Works product. Do not introduce customer-specific business logic into the core when configuration or an adapter is appropriate.

Do not provision production infrastructure, purchase services, change production accounts, or introduce consequential external dependencies without explicit approval.

## Data rules

The repository is public. Use synthetic examples only.

Never commit:

- real customer information or PHI;
- secrets or credentials;
- production identifiers that expose private infrastructure;
- private keys or tokens;
- sensitive logs or exports.

## Dependency policy

Prefer small, maintained dependencies with a clear purpose. Every new runtime dependency requires review for purpose, maintenance, security, licensing, portability, and whether the platform can provide the capability without another package.

Dependency updates must change `package.json` and `package-lock.json` together and pass `npm run validate`.

Do not introduce a large frontend framework, database, identity product, analytics system, or paid SaaS merely for convenience.

## Architecture boundaries

Keep `src/domain` and `src/application` independent of Hono, AWS SDKs, Node delivery/provider APIs, and browser presentation. HTTP behavior belongs in `src/http`; presentation belongs in `src/web`; provider implementations belong in `src/adapters`.

## Quality

Applicable formatting, linting, strict type checking, unit/integration tests, browser tests, accessibility checks, responsive checks, dependency-security checks, secret detection, architecture-boundary tests, and build validation must remain green.
