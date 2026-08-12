# ADR-0004 — DynamoDB Reference State Store

- Status: **Accepted**
- Date: 2026-08-11

## Context

Secure Exchange needs to support known queue, thread, message, attachment, lifecycle, audit, retention, access-grant, search/filter, transaction, and operational reporting access patterns with low operational overhead in isolated customer deployments.

## Decision

Use DynamoDB as the initial AWS reference state store.

Keep persistence behind provider-neutral repository and transaction abstractions.

DynamoDB-specific concepts such as partition/sort keys, table names, GSIs, expressions, conditional-write syntax, and AWS SDK types must not spread into the domain layer.

See [Access Patterns](../architecture/ACCESS_PATTERNS.md).

## Consistency/security rule

Secondary-index results may be eventually consistent and cannot be used as authorization or other security-sensitive truth.

Queue/search indexes identify candidate records only.

Where access, lifecycle state, ownership, disposition eligibility, or other security-sensitive behavior depends on current data, the application must validate authoritative records directly and use conditional/transactional operations as required.

## Transactions

Use application transaction boundaries to support atomic operations where workflow evidence and state must agree, such as:

- lifecycle transition + audit event;
- reply/message append + related audit event;
- access-grant creation/revocation + related audit event.

The physical DynamoDB transaction design is deferred to implementation.

## Retention

DynamoDB TTL is only a cleanup/backstop mechanism.

Secure Exchange-controlled retention/disposition is authoritative. The product must explicitly determine due work, revalidate eligibility, dispose of objects/state, and record outcome.

TTL must not be represented as timely retention enforcement.

## Principal alternative — Aurora/PostgreSQL

Aurora PostgreSQL/portable PostgreSQL is the principal credible alternative and future adapter path.

Advantages:

- flexible relational queries;
- joins and constraints;
- conventional SQL reporting;
- broad portability.

Reasons not selected initially:

- larger database lifecycle/schema/connection-management surface;
- MVP access patterns are primarily known-key, ordered-thread, queue-index, state-transition, and due-work queries;
- DynamoDB better matches the low-operations serverless reference architecture.

## Revisit criteria

Reconsider if normal product use requires broad ad-hoc relational reporting, complex joins, or query flexibility that makes DynamoDB indexing/materialization disproportionately complex.
