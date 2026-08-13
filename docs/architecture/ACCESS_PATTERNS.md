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
