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

## Release 0.6 attachment authorization boundary

Release 0.6 adds one staff permission: `ATTACHMENT_READ`. Staff retrieval requires a live STAFF authorization in the requested deployment, current queue scope for the authoritative thread, and that permission. Knowledge of an attachment ID, message ID, thread ID, queue candidate, or cached summary never grants retrieval authority.

The retrieval service validates actor deployment and authoritative thread before message/attachment access, then verifies the attachment belongs to the same deployment, thread, and expected message and is exactly `CLEAN` before the protected-content port is called.

Scan processing does not impersonate staff. It uses a narrow trusted SYSTEM application boundary with a server-held system actor reference for minimized audit events. Clients do not select scanner identity, scan permissions, or authoritative scan state.

The former `DOWNLOAD_EVIDENCE_RECORD` permission and standalone `WorkflowService.recordDownloadEvidence()` path are removed. Normal application `ATTACHMENT_DOWNLOADED` evidence is now reachable only through successful authoritative attachment retrieval.

## Release 0.7 AccessGrant authorization boundary

Release 0.7 introduces `ACCESS_GRANT_ISSUE` and `ACCESS_GRANT_REVOKE` as explicit staff/admin permissions. Issuance and revocation still require current deployment ownership, authoritative thread lookup, live actor authorization, and current queue scope.

External authority does not reuse staff queue permissions. A valid AccessGrant is thread-scoped authority proven by possession of the high-entropy raw secret plus authoritative grant validation. Grant ID, thread ID, external-participant reference, queue membership, cached summaries, or knowledge of another resource identifier are insufficient.

The raw grant secret is generated by the application and returned once at issuance. It is never persisted. Only a versioned SHA-256 verifier is stored. The verifier is not returned by the public validation result, audit records, queue projections, or external conversation projection. The opaque external-participant reference is retained for attribution only; it is not the bearer credential.

Validation fails closed for unknown or wrong-scope grants, wrong secret, absent operation, revocation, server-time expiry, or a currently ineligible thread. Externally observable failures collapse to a conservative access-denied result.

Release 0.7 implements only `THREAD_READ`. External attachment authorization and external reply authority are deliberately deferred. A later attachment path must reuse the Release 0.6 `CLEAN` attachment and protected-content/download-evidence invariants rather than relying on a grant alone.

## Release 0.8 external attachment authorization

`THREAD_READ` does not authorize attachment retrieval. External attachment retrieval requires a grant explicitly carrying `ATTACHMENT_READ`, and issuance requires the current AccessGrant policy to allow that operation. A grant carrying only attachment-read authority cannot retrieve the conversation unless `THREAD_READ` is separately granted.

Every external attachment use revalidates the bearer verifier, grant deployment/thread, explicit operation, revocation, expiry using authoritative server time, and current external-access thread eligibility. `EXPIRED` and `DISPOSED` threads remain ineligible and grant use never transitions lifecycle.

After grant authorization, authoritative message and attachment ownership and the Release 0.6 attachment safety/content invariant are mandatory. No identifier alone is authority. External failures remain conservative and do not expose internal authorization or storage details.

## Release 0.9 browser delivery authorization

Credential presentation does not create a second session authority. The browser capability merely carries the already-issued bearer credential for subsequent same-origin requests. Every protected browser operation reuses the existing application layer to revalidate verifier proof, deployment/thread scope, explicit operation, revocation, server-time expiry, and current thread eligibility.

`THREAD_READ` authorizes only the bounded external conversation projection. `ATTACHMENT_READ` authorizes only candidate metadata and the authoritative Release 0.8 download path. The HTTP adapter does not broaden grants, infer authority from identifiers, or reproduce attachment safety rules.

## Release 0.10 external reply authorization

AccessGrant external authority now uses three independent operations: `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY`. The current policy must explicitly permit `THREAD_REPLY` before issuance can include it. A grant carrying only read or attachment authority cannot reply, and a reply-only grant gains neither read nor attachment authority.

Reply issuance additionally requires the current authoritative thread to be reply-eligible. At use time, the application revalidates the bearer verifier, deployment/thread scope, explicit reply operation, revocation, authoritative expiry, broad external-access eligibility, and the stricter reply lifecycle rule. `COMPLETED` remains readable with valid `THREAD_READ` authority but cannot accept external replies.

External actor attribution comes only from the validated grant's opaque `externalParticipantRef`. Caller-provided body text, email/display name, IP address, browser fields, or extra request properties cannot select or override actor identity, actor kind, deployment, message ID, audit actor, or timestamp. Unsafe external failures remain collapsed to conservative `EXTERNAL_ACCESS_DENIED` behavior.

## Release 0.11 browser reply authorization

Browser possession of the synthetic capability cookie is never sufficient authorization. Every reply POST delegates to the authoritative Release 0.10 application operation and must pass current AccessGrant lookup/scope, verifier proof, explicit `THREAD_REPLY`, revocation, expiry, current thread reply eligibility, expected thread version, and the atomic `AccessGrantAuthorityGuard` bound to the authoritative reply timestamp.

Browser-supplied actor, actor kind, message ID, audit ID, timestamp, or lifecycle values are not accepted as authority inputs.

## Release 0.12 production bootstrap/session authorization

Release 0.12 preserves the existing AccessGrant authority model and makes the production delivery distinction explicit:

**bootstrap challenge != browser session != AccessGrant authorization.**

### Bootstrap locator and proof

A bootstrap URL may carry an opaque `bootstrapId` locator only. Knowledge or possession of that locator never authorizes a thread, attachment, reply, session, or AccessGrant operation.

The participant must present the associated one-time proof by protected POST. A future implementation validates the keyed/non-reversible verifier, attempt/lock state, expiry, consumption state, deployment binding, and current AccessGrant eligibility before any session can be established. A consumed, locked, expired, unknown, wrong, or reissued challenge fails with the same generic external behavior.

Successful bootstrap atomically consumes the challenge and creates a fresh browser session. GET navigation never consumes authority, so mail-security scanners/prefetchers cannot establish access merely by following the locator link.

`MAILBOX_ONLY` means both locator and proof may be observable from the same mailbox. It is not MFA and must not be represented as protection against a compromised mailbox. `INDEPENDENT_CHALLENGE` is required when the deployment policy calls for a separate verification trust anchor.

### Browser delivery session

The browser session proves only possession of a short-lived delivery bearer whose raw 256-bit material is never persisted. A session record or cookie is not an `AccessGrant` and carries no wildcard product permission.

For every protected operation, the delivery layer resolves the session and the application then authoritatively revalidates:

1. deployment;
2. thread;
3. AccessGrant identity and current verifier/proof boundary;
4. requested explicit operation;
5. grant revocation;
6. authoritative grant expiry;
7. current external-access or reply lifecycle eligibility;
8. authoritative message/attachment ownership and safety state where applicable;
9. expected thread/resource version where applicable;
10. `AccessGrantAuthorityGuard` for reply mutation.

`THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` remain independent. A valid session does not convert a missing operation into authority, and stale UI visibility never authorizes a mutation.

### Lifetime, logout, reissue, and compromise

Session absolute/idle expiry is an additional delivery precondition and cannot extend the underlying AccessGrant. The reference contract permits one active browser session per AccessGrant; establishing another invalidates the earlier session.

End-access/logout revokes the server-side session before clearing the cookie. Logout alone does not revoke the AccessGrant. Conversely, AccessGrant revocation/expiry immediately wins over a still-present session because every protected operation revalidates current grant state.

Reissue invalidates outstanding bootstrap challenges and active sessions for the grant. Suspected credential compromise requires AccessGrant revocation and newly issued grant/bootstrap authority, not just clearing browser state.

### CSRF and same-origin are separate controls

Origin, Fetch Metadata, CSRF synchronizer proof, `SameSite`, CSP/form-action, and closed CORS protect browser request delivery. They do not grant application authority. A production mutation is accepted only when both the browser mutation boundary and the current AccessGrant/application authorization checks succeed.

### Recovery authority

Backup/restore must not roll authorization backward. A recovered state in which monotonic grant/session revocation cannot be proven requires an authoritative access/security epoch or equivalent invalidation mechanism before external access resumes. Recovery convenience cannot make a previously revoked credential usable again.

See [External Delivery and Credential Bootstrap Boundary](../architecture/EXTERNAL_DELIVERY_BOUNDARY.md) and [ADR-0005](../adr/0005-external-bootstrap-session-boundary.md).
