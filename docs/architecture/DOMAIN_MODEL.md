# Provider-Neutral Domain Model

This document defines business concepts. Provider-specific identifiers and SDK types belong in adapters.

## DeploymentContext

Represents the owning customer deployment/tenant context.

Key properties:

- `deploymentId` — opaque internal identifier;
- product configuration reference;
- authorization-policy reference;
- retention-policy reference.

Even isolated customer deployments retain this context to make ownership explicit and testable.

## Queue

A role-oriented work destination.

Properties include:

- queue identifier;
- display label;
- active/inactive state;
- allowed routing categories;
- authorization grants.

Queues are not individual mailboxes and should not primarily route by named person.

## Thread

The top-level exchange/work item.

Core properties:

- thread identifier;
- deployment identifier;
- queue identifier;
- lifecycle state;
- routing category;
- created/updated timestamps;
- attention timestamp;
- completion timestamp when applicable;
- disposition due timestamp when applicable;
- version for concurrency control.

### Thread lifecycle

Authoritative states:

- `NEW`
- `IN_PROGRESS`
- `AWAITING_EXTERNAL`
- `AWAITING_STAFF`
- `COMPLETED`
- `EXPIRED`
- `DISPOSED`

Allowed transitions are application-controlled. `DISPOSED` is terminal. `COMPLETED` schedules disposition but is not equivalent to deletion.

Typical transitions:

- `NEW -> IN_PROGRESS`
- `IN_PROGRESS -> AWAITING_EXTERNAL`
- `AWAITING_EXTERNAL -> AWAITING_STAFF`
- `AWAITING_STAFF -> IN_PROGRESS`
- active states -> `COMPLETED`
- eligible active/completed access grant expiry -> `EXPIRED` where the product policy requires thread expiry
- eligible retained state -> `DISPOSED`

Implementation must reject invalid or stale transitions using authoritative state/version checks.

## Message

An immutable logical communication within a thread.

Properties:

- message identifier;
- thread/deployment identifiers;
- direction (`EXTERNAL_TO_STAFF` or `STAFF_TO_EXTERNAL`);
- actor reference/category;
- created timestamp;
- body-content reference/representation under the approved storage model;
- attachment references.

Messages are not edited in place. Corrections are new messages or explicit administrative events.

## Attachment

Metadata for a protected object.

Properties:

- attachment identifier;
- message/thread/deployment identifiers;
- original display filename handled as untrusted metadata;
- normalized media/type metadata;
- size;
- object-storage reference;
- malware state;
- created timestamp;
- disposition state.

Attachment safety states:

- `PENDING_UPLOAD`
- `QUARANTINED`
- `CLEAN`
- `REJECTED`
- `DELETED`

Only `CLEAN` attachments are eligible for normal authorized retrieval.

## AccessGrant

Represents temporary external access authority.

Properties:

- opaque grant identifier or verifier reference;
- deployment/thread scope;
- permitted operations;
- issued/expiry timestamps;
- revocation status;
- optional usage constraints.

Raw secret material must not be stored in ordinary logs or audit event details.

## Actor

Represents the initiator of an auditable action without forcing all external participants to have accounts.

Actor categories:

- external participant;
- authenticated staff;
- administrator;
- system process.

## AuditEvent

Append-oriented evidence of a meaningful product/security event.

Includes:

- event identifier;
- deployment identifier;
- event type;
- actor category/reference;
- target identifiers;
- timestamp;
- outcome;
- minimal structured metadata.

Audit events must not duplicate message bodies, document contents, secret grants, or unnecessary sensitive metadata.

## RetentionPolicy

Defines supported retention/disposition behavior.

Includes:

- trigger event/state;
- duration;
- allowed administrative bounds;
- disposition action;
- policy version.

## ProductConfiguration

Provider-neutral configuration for branding, queues, file constraints, notification wording, workflow defaults, and supported retention settings.

Secrets and provider credentials are not ProductConfiguration.

## Repository and transaction abstractions

The domain/application layer depends on abstractions such as:

- `ThreadRepository`
- `MessageRepository`
- `AttachmentRepository`
- `AuditRepository`
- `AccessGrantRepository`
- `RetentionRepository`
- `ConfigurationRepository`
- `TransactionBoundary`

DynamoDB partition/sort keys, expressions, table names, GSIs, and AWS SDK types must not leak through these contracts.
