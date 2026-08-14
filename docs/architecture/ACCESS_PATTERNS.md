# State-Store Access Patterns

## Decision context

DynamoDB is the approved initial AWS reference state store. Aurora/PostgreSQL remains the principal credible alternative and future adapter path.

The persistence layer is hidden behind provider-neutral repository and transaction abstractions.

## Required MVP access patterns

| ID | Concern | Access pattern | Consistency/security requirement |
|---|---|---|---|
| AP-01 | Queue | List candidate threads for a queue by lifecycle state and activity/attention time | Index may be eventually consistent; candidate list is not authorization proof |
| AP-02 | Queue | Count/summarize new or attention-needed work | Operationally eventual counts acceptable |
| AP-03 | Thread | Load one thread by deployment + thread identifier | Authoritative validation required |
| AP-04 | Thread | Validate current state/version before transition | Authoritative/conditional operation required |
| AP-05 | Message | List messages for a thread in chronological order | Must follow successful thread authorization |
| AP-06 | Message | Append a message to an authorized thread | Transaction/conditional checks as required |
| AP-07 | Attachment | List attachment metadata by message/thread | Must follow thread authorization |
| AP-08 | Attachment | Resolve one attachment for controlled retrieval | Authoritative deployment/thread/attachment validation |
| AP-09 | Lifecycle | Transition state exactly once from expected current state | Conditional write/transaction |
| AP-10 | Audit | Append audit event with business mutation | Same application transaction where evidence must be atomic |
| AP-11 | Retention | Find records due for disposition | Purpose-built due-date index/query |
| AP-12 | Retention | Revalidate disposition eligibility before deletion | Authoritative state/policy check |
| AP-13 | Search/filter | Filter queue/work views by state, category, date, routing metadata | Metadata-only, bounded indexed access |
| AP-14 | Search/filter | Locate a known thread by opaque identifier | Direct authoritative lookup |
| AP-15 | Access grant | Validate/revoke external access grant | Authoritative lookup; never log raw secret |
| AP-16 | Reporting | Operational counts by queue/state/date | Purpose-built counters/queries; no arbitrary content analytics |
| AP-17 | Configuration | Load current deployment configuration/policy version | Authoritative or suitably cached with invalidation/versioning |
| AP-18 | Transaction | State transition + related audit + related record creation | Atomic all-or-nothing application transaction |
| AP-19 | Workflow evidence | Retrieve opened/read and download evidence for an authorized thread | Distinct evidence types; must follow authoritative thread authorization |
| AP-20 | Transfer attestation | Append an authenticated staff TransferAttestation for a deployment/thread | Authoritative actor/thread/deployment validation; append/supersede semantics |
| AP-21 | Transfer attestation | Retrieve current/qualifying TransferAttestation evidence for a thread | Authoritative lookup; do not infer from download/audit summaries |
| AP-22 | Completion | Validate configured completion preconditions, including qualifying TransferAttestation when required, then transition to `COMPLETED` | Authoritative policy/thread/attestation validation; fail closed; conditional/transactional mutation |
| AP-23 | Bootstrap | Resolve and verify one pending external bootstrap challenge by deployment + opaque bootstrap locator | Locator is not authority; keyed verifier, attempts, lock, expiry, and current AccessGrant must be authoritative |
| AP-24 | Bootstrap/session | Consume one valid bootstrap challenge and establish a new browser session | Atomic one-time consume + session creation; replay must not create another session |
| AP-25 | External session | Resolve current browser session and validate verifier, absolute/idle lifetime, revocation, AccessGrant binding, and security epoch | Authoritative lookup; raw browser bearer is never persisted; session is transport only |
| AP-26 | External session | Invalidate session(s) for logout, new-session concurrency, AccessGrant reissue/revocation, compromise, or recovery epoch | Conditional/idempotent invalidation; application AccessGrant remains authoritative |
| AP-27 | Bootstrap | Increment failed bootstrap proof attempts and lock/invalidate at configured maximum | Atomic/conditional counter; generic external result; raw proof never stored/logged |
| AP-28 | Recovery | Advance/read deployment access/security epoch when restore continuity cannot prove monotonic revocation | Authoritative kill-switch semantics; stale pre-epoch bootstrap/session authority denied |

## Search scope

MVP search is metadata-oriented.

Initial searchable/filterable dimensions may include:

- queue;
- lifecycle state;
- routing category;
- created/updated date range;
- attention age;
- completion/disposition due state;
- known thread identifier;
- bounded workflow-evidence summaries such as opened/downloaded/transfer-attested status when purpose-built for the work view.

Workflow-evidence summaries or secondary indexes are convenience views only. They are not authoritative proof for completion or other security-sensitive decisions.

Full-text indexing of message bodies or attachment contents is deferred.

## Reporting scope

MVP reporting is operational, not analytical.

Examples:

- new/in-progress/completed counts;
- aging buckets;
- queue workload;
- disposition due/failed counts;
- notification or malware-status operational outcomes;
- opened/downloaded/transfer-attested workflow counts without copying sensitive content.

Do not create content warehouses or copy message/document content for reporting.

## Workflow-evidence semantics

Opened/read, download, TransferAttestation, and thread completion are independent facts.

- Opening a thread can append an opened/read audit event but does not prove a file was downloaded.
- A successful file download can append download evidence but does not prove a downstream transfer or filing occurred.
- A qualifying TransferAttestation is an authoritative staff business record, not an inference from a download event.
- A TransferAttestation does not itself transition the thread to `COMPLETED`.
- When completion policy requires transfer/filing evidence, AP-22 must load and validate qualifying authoritative attestation data before the completion transition is accepted.

## DynamoDB reference approach

The exact physical table design is deferred to the implementation release, but it must satisfy the access patterns above without exposing DynamoDB concepts to the domain.

Expected techniques may include:

- deployment-scoped partitioning;
- thread-local sort ordering;
- purpose-built GSIs for queue/activity and disposition due work;
- conditional writes for optimistic concurrency;
- DynamoDB transactions for atomic business mutation + audit evidence.

### Critical consistency rule

Global secondary-index results may be eventually consistent.

Therefore:

- queue/search/index results identify candidates only;
- opening, mutating, downloading, completing, disposing, or authorizing a resource requires authoritative record validation where security or lifecycle correctness depends on current state;
- indexed/materialized workflow-evidence summaries cannot satisfy a completion attestation requirement without authoritative validation;
- an index row can never grant access.

## Retention rule

DynamoDB TTL is not timely retention enforcement.

Secure Exchange performs application-controlled disposition at the required time. TTL may be configured only as a delayed cleanup/backstop for data already eligible for removal.

## Principal alternative — Aurora/PostgreSQL

Aurora PostgreSQL or portable PostgreSQL is the principal alternative because it provides:

- relational constraints and joins;
- flexible SQL reporting;
- conventional migration tooling;
- broad portability outside AWS.

Tradeoffs versus DynamoDB for the reference deployment include more database lifecycle/schema/connection management and a larger operational surface for an MVP whose access patterns are mostly known-key and purpose-built queries.

## Revisit criteria

Reconsider the reference state store if the product develops a justified need for:

- broad ad-hoc relational reporting;
- complex multi-entity joins central to normal workflows;
- query flexibility that would otherwise require excessive secondary indexes/materialized views;
- portability requirements that outweigh the serverless operational advantages of DynamoDB.

A future PostgreSQL adapter must implement the same provider-neutral repository/transaction contracts rather than changing domain semantics.

## Release 0.5 delivery-adapter note

Release 0.5 does not change the production persistence access-pattern decision or select a browser/database schema. The local browser adapter reuses the existing in-memory WorkflowStore ports and application-service access patterns.

Queue GETs remain candidate projections only. Conversation GETs perform authoritative thread/actor/queue/action validation before loading messages. Reply mutations retain expected-version and atomic thread/message/audit behavior. The optional Start work action uses the existing workflow transition service.

Server-generated development IDs and POST/Redirect/GET routing are delivery concerns, not new DynamoDB key or index contracts.

## Release 0.6 attachment access-pattern implementation

The in-memory WorkflowStore now supports authoritative attachment metadata lookup by deployment + attachment ID, per-message attachment listing for count enforcement, current per-deployment attachment policy, and versioned attachment updates inside the existing copy-on-write transaction boundary.

Protected bytes are intentionally separate behind `ProtectedContentStore` (`put`, `get`, `delete`) using opaque `ProtectedContentRef` values. The Release 0.6 in-memory implementation stores cloned `Uint8Array` values for tests/development only. Its map keys are not S3 keys, filesystem paths, DynamoDB keys, or a future provider schema.

Production adapters must preserve the ordering/compensation invariant demonstrated here: content staging can succeed before metadata publication, so metadata publication failure requires cleanup/orphan handling rather than assuming a distributed transaction. Retrieval must authorize against authoritative metadata before object access and must not emit successful download evidence until the object is actually resolved.

## Release 0.7 AccessGrant and attachment-count access patterns

Release 0.7 adds executable access patterns to issue one thread-scoped AccessGrant using current authoritative staff/admin authorization, current thread state, current AccessGrant policy, and expected thread version; resolve one grant by deployment plus opaque grant ID for bearer-verifier validation; revalidate deployment/thread scope, explicit operation, revocation, server-time expiry, and current thread eligibility before external content is loaded; retain/version a grant for explicit revocation; and append minimized grant evidence without persisting the raw secret or exposing the verifier.

New attachment publication also requires an authoritative message-scoped guard carrying the current attachment-policy reference. The transaction validates the current policy and post-mutation per-message count before publication.

A grant ID, queue/index projection, or cached state is never authorization truth. The in-memory maps are development adapters only and do not select DynamoDB keys or indexes. Future provider implementations must preserve verifier checks, current-state revalidation, optimistic mutation semantics, and the authoritative attachment-count guard.

## Release 0.8 external attachment access pattern

External attachment retrieval requires an authoritative AccessGrant lookup and verifier check for the same deployment and thread with explicit `ATTACHMENT_READ`. The grant must be unrevoked, unexpired according to server time, and the current authoritative thread must remain externally eligible.

After external authority is established, the retrieval path converges with staff retrieval: load the authoritative message, load the attachment, verify deployment/thread/message ownership, require state exactly `CLEAN` and not deleted, resolve protected content, verify returned byte length against authoritative metadata, then atomically append `ATTACHMENT_DOWNLOADED` evidence. Attachment ID, message ID, thread ID, grant ID, queue data, or a previously valid grant is never sufficient by itself.

External-facing lookup and content failures are collapsed to a conservative access-denied result so the application does not unnecessarily disclose which grant, thread, message, attachment, or content object exists.

## Release 0.9 browser capability access pattern

The Release 0.9 capability cookie is a development delivery mechanism, not an authorization record or permanent session. It is host-only, HttpOnly, SameSite=Strict, path-scoped to `/demo/external/access`, and bounded to 600 seconds; it is marked Secure whenever the request is HTTPS. It contains no persisted verifier and is never copied into localStorage, sessionStorage, IndexedDB, HTML hidden fields, generated links, audit, analytics, or logs.

Selectors carried in the cookie or attachment forms remain untrusted. Conversation delivery always requires current `THREAD_READ`. Candidate listing and download always require current `ATTACHMENT_READ`. A mixed grant may exercise both; neither operation implies the other. Revocation, authoritative expiry, or ineligible thread state wins over any still-present browser cookie.

## Release 0.10 external reply access pattern

AccessGrant issuance may include `THREAD_REPLY` only when the current AccessGrant policy explicitly permits it and the authoritative thread is currently reply-eligible. If a requested grant includes reply authority while the thread is `COMPLETED`, `EXPIRED`, or `DISPOSED`, issuance fails rather than silently removing the operation.

Every reply use revalidates the presented bearer against the persisted verifier, deployment/thread scope, explicit `THREAD_REPLY`, revocation, authoritative server-time expiry, current broad external-access eligibility, and the stricter external-reply lifecycle rule. The caller never supplies the external actor; attribution comes only from the authoritative grant.

Reply commits one immutable message, the expected-version thread activity/attention update, and minimized `MESSAGE_APPENDED` evidence in the same `WorkflowStore` mutation. A stale concurrent thread mutation fails the reply without partial message or audit publication. `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` remain independent candidate/use paths; no identifier, prior validity, browser control, or index row grants authority.

## Release 0.11 browser reply access pattern

The synthetic external browser capability remains a short-lived transport container rather than authorization truth. The session UI may expose reply only when `THREAD_REPLY` is currently usable, but UI visibility never authorizes the mutation. `POST /demo/external/access/reply` delegates to `AccessGrantService.replyExternalConversation()`, which revalidates bearer/verifier proof, deployment/thread scope, explicit `THREAD_REPLY`, revocation, expiry, current lifecycle, expected thread version, and the Release 0.10 `AccessGrantAuthorityGuard` at commit.

Reply-only authority does not grant conversation read, and read-only authority does not grant reply. The adapter does not widen an AccessGrant.

## Release 0.12 bootstrap/session access-pattern requirements

AP-23 through AP-28 are production-delivery design requirements, not implemented storage schema in this release.

The bootstrap locator may identify a pending challenge record but is never proof of authority. A future state adapter must store only a keyed/non-reversible verifier for the human-entered bootstrap proof, because the proof has intentionally lower entropy than the 256-bit random AccessGrant/session bearers. The keyed verifier secret/key is held separately from the state store in customer-owned secret/key-management facilities.

Successful bootstrap must be a transaction-equivalent operation: validate current challenge state and proof, enforce attempt/expiry/lock rules, revalidate the current AccessGrant boundary, mark the challenge consumed, create the fresh browser-session verifier record, and invalidate the prior active session for that AccessGrant. A replay arriving after the consume cannot create another session.

The production browser session stores only a one-way verifier for a uniformly random 256-bit bearer. The raw bearer remains browser/transient-memory material only. Session lookup and valid lifetime are delivery preconditions; they never substitute for current AccessGrant operation, revocation, expiry, thread/resource, or reply-guard checks.

Restore/failover must not cause version/time rollback to resurrect delivery authority. If a persistence adapter cannot guarantee monotonic revocation across restore, AP-28 provides a deployment-wide access/security epoch or equivalent authoritative invalidation mechanism. Sessions/challenges created before the active epoch fail closed and controlled reissue is required.

Secondary indexes, caches, edge rate-limit stores, notification-delivery status, and browser session records may optimize delivery/operations only. None grants product access.

See [External Delivery and Credential Bootstrap Boundary](EXTERNAL_DELIVERY_BOUNDARY.md).
