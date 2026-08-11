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

## Search scope

MVP search is metadata-oriented.

Initial searchable/filterable dimensions may include:

- queue;
- lifecycle state;
- routing category;
- created/updated date range;
- attention age;
- completion/disposition due state;
- known thread identifier.

Full-text indexing of message bodies or attachment contents is deferred.

## Reporting scope

MVP reporting is operational, not analytical.

Examples:

- new/in-progress/completed counts;
- aging buckets;
- queue workload;
- disposition due/failed counts;
- notification or malware-status operational outcomes.

Do not create content warehouses or copy message/document content for reporting.

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
- opening, mutating, downloading, disposing, or authorizing a resource requires authoritative record validation where security or lifecycle correctness depends on current state;
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
