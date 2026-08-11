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

Prefer small, maintained dependencies with a clear purpose. Every external runtime dependency should have:

- a documented purpose;
- a security/privacy assessment;
- a cost characteristic;
- a lock-in assessment;
- a replacement or portability path.

Do not introduce a large frontend framework, database, identity product, analytics system, or paid SaaS merely for convenience.

## Quality

As executable code is added, applicable formatting, linting, strict type checking, tests, accessibility checks, responsive checks, dependency/security checks, secret detection, authorization tests, tenant/deployment isolation tests, upload validation tests, negative tests, and build validation must remain green.
