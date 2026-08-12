# Authorization

## Core rule

Authentication identifies an actor. Authorization determines whether that actor may perform a specific operation on a specific authoritative resource.

All authorization is enforced server-side.

## Actor classes

- unauthenticated external participant;
- externally authorized access-grant holder;
- authenticated staff user;
- authenticated administrator;
- system process with narrowly scoped service authority.

## Staff authentication boundary

The initial reference adapter uses Amazon Cognito for staff identity.

The application must validate trusted token/session properties such as issuer, audience/client, signature, validity, and expected authentication context through the identity adapter.

The domain consumes a normalized identity/actor context, not Cognito SDK objects.

## Queue authorization

Staff permissions are role/queue based.

A user may:

- list only queues they are granted;
- open a thread only if the authoritative thread belongs to the current deployment and an allowed queue/resource scope;
- mutate only actions granted to their role;
- administer configuration only with explicit administrative authority.

## Critical index rule

Queue/search views may be generated from eventually consistent secondary indexes.

These results are **candidate work lists only**.

A thread identifier appearing in a queue result never grants access. Before content retrieval, mutation, download, reply, audit viewing, or disposition, the application validates the authoritative record and current actor permissions.

## External participant access

External initiation does not require a full staff-style account.

Public submission endpoints permit only narrowly defined actions:

- create a submission in an allowed public route;
- upload to grants scoped to that new submission;
- receive non-sensitive confirmation.

External retrieval/reply uses an expiring, revocable `AccessGrant` scoped to an explicit deployment/thread and permitted operations.

Raw secret grant material must not be written to logs or audit details.

The exact higher-assurance verification mechanism for regulated production remains a pre-production security gate.

## Object access

Object storage is never the authorization authority.

Before issuing any temporary object access:

1. validate current actor/access grant;
2. load authoritative thread/attachment ownership;
3. confirm deployment scope;
4. confirm attachment state is retrievable (for example `CLEAN`);
5. confirm lifecycle/retention has not revoked access;
6. issue narrowly scoped, short-lived access.

## Lifecycle authorization

Only allowed roles may move a thread between allowed states.

Transitions use expected-current-state/version checks to prevent stale UI actions from overriding newer decisions.

## Administrative authorization

Administrative actions include, at minimum:

- queue/role mapping changes;
- retention-policy changes;
- upload-policy changes;
- privileged audit access;
- feature/configuration changes affecting security.

These actions require explicit authority and audit events.

## System actors

Background processes receive only the permissions needed for their function.

Examples:

- malware-result processor cannot administratively browse all message content;
- disposition worker can identify due items and delete within validated policy;
- notification worker receives only the non-sensitive message template/data needed for delivery.

## Failure behavior

Authorization uncertainty fails closed.

Do not expose whether a forbidden resource exists when a generic not-found response reduces enumeration risk.

## Release 0.5 synthetic browser authorization boundary

The Release 0.5 browser slice has no production authentication or login. A trusted local development fixture supplies one synthetic STAFF ActorContext plus its authoritative queue scope and permissions. The browser cannot choose or alter that actor, deployment, queue grant, or permission set.

External accountless initiation does not accept an audit actor/reference from form input. The delivery adapter generates an opaque external-participant reference server-side. Browser-provided thread, message, audit, deployment, queue-authority, or actor values are not trusted as authoritative identifiers.

Staff queue, open/read, reply, and optional Start work actions continue through existing application authorization. Queue appearance or knowledge of a thread reference remains insufficient for content access.

Staff reply additionally requires the portable lifecycle rule: NEW, IN_PROGRESS, AWAITING_EXTERNAL, or AWAITING_STAFF. COMPLETED, EXPIRED, and DISPOSED are rejected regardless of UI visibility.
