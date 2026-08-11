# Architecture

## Architectural style

Secure Exchange is a provider-neutral application core with replaceable infrastructure adapters.

The domain layer owns business meaning. Infrastructure and presentation layers translate to and from that domain without becoming the source of workflow or authorization truth.

## Preferred reference deployment

The approved initial reference architecture is AWS-first and customer-owned, with one isolated deployment per customer.

Reference building blocks:

- Amazon Cognito — initial staff identity-provider adapter;
- Amazon SES — notification-delivery adapter;
- Amazon S3 — protected object storage;
- AWS Lambda and API Gateway — application/API execution where appropriate;
- AWS KMS-backed controls — encryption/key management;
- GuardDuty Malware Protection for S3 — initial malware-scanning adapter;
- CloudTrail and CloudWatch — infrastructure/security telemetry;
- DynamoDB — initial application state-store adapter;
- Secure Exchange application audit events — workflow/security evidence.

No AWS resources are created by Release 0.1.

## Layer boundaries

### Domain

Contains provider-neutral entities, value objects, lifecycle rules, authorization policy, retention rules, audit semantics, and repository/service contracts.

The domain must not import Hono, Lambda, API Gateway, Cognito, DynamoDB, S3, SES, GuardDuty, or browser APIs.

### Application

Coordinates use cases and transaction boundaries. It invokes domain rules and abstract ports for persistence, identity context, object storage, notifications, malware status, and time.

### Adapters

Translate provider APIs into application/domain ports. AWS-specific keys, expressions, SDK types, ARNs, and request objects remain here.

### HTTP delivery

A thin Web-standards-oriented HTTP layer performs routing, request parsing, response construction, security middleware, and translation to application commands/queries.

### Web presentation

Semantic HTML/CSS with small TypeScript modules initially. Client code is not an authorization boundary.

## Trust boundaries

1. public internet to public submission/retrieval endpoints;
2. authenticated staff browser to application API;
3. application runtime to identity provider;
4. application runtime to state store;
5. application runtime to object storage;
6. object upload/scanning pipeline;
7. application runtime to notification provider;
8. application runtime to infrastructure logging;
9. deployment administration boundary.

See [Data Flow](DATA_FLOW.md) and [Threat Model](../security/THREAT_MODEL.md).

## Isolation

The preferred deployment model has no intentional application data path between customer deployments.

Every business record still carries a deployment/tenant context in the domain model so isolation assumptions are explicit, testable, and portable to alternative deployment models.

## Sensitive-content rules

Sensitive message/document content must not appear in:

- ordinary notification email bodies or subjects;
- URLs or query strings;
- browser analytics;
- infrastructure logs;
- error messages;
- public repository fixtures.

Opaque identifiers are preferred where identifiers leave the trusted application boundary.

## State consistency

Security-sensitive decisions use authoritative records.

DynamoDB secondary indexes may support queue/search views, but authorization, ownership, current lifecycle state, disposition eligibility, and other security-sensitive checks must validate authoritative base records where required.

## Retention

Secure Exchange-controlled disposition is authoritative. DynamoDB TTL may be used only as a cleanup/backstop mechanism and cannot be represented as timely retention enforcement.

See [Retention and Disposition](../security/RETENTION_AND_DISPOSITION.md).

## Portability

Provider-specific behavior is isolated behind interfaces. Portability means the core can be adapted without rewriting domain semantics; it does not mean all providers expose identical operational guarantees.
