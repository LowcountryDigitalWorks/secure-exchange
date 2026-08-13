# MVP and Roadmap

## MVP outcome

The MVP allows an external participant to submit a message and approved documents to an organization, allows authorized staff to manage that exchange through role-based queues, and allows secure outbound replies/retrieval without placing sensitive content in ordinary notification email.

## MVP capabilities

### External exchange

- accountless external initiation;
- minimal sender/contact metadata;
- role/queue routing;
- secure message submission;
- attachment upload with size/type validation;
- non-sensitive notification;
- expiring, revocable secure retrieval capability;
- secure reply/retrieval workflow.

### Staff workflow

- staff authentication through an identity-provider adapter;
- queue-based work views;
- new/unread indicators;
- thread/conversation grouping;
- chronological messages;
- visible opened/read evidence distinct from download evidence;
- attachment status and controlled download with distinct download evidence;
- authenticated staff transfer/filing attestation when downstream transfer cannot be technically proven;
- lifecycle state transitions kept separate from opened/read, download, and transfer/file evidence;
- basic aging/attention indicators;
- completion workflow that enforces configured preconditions, including a valid transfer/filing attestation when required;
- metadata search/filter appropriate to known access patterns.

Opened, Downloaded, Transferred/Filed, and Completed are separate workflow facts. None is automatically inferred from another and they do not each need to be thread lifecycle states.

### Administration

- queue/role configuration;
- retention/disposition configuration within supported bounds;
- completion-policy configuration within supported bounds;
- file-type and size policy;
- product branding configuration;
- notification-template configuration for non-sensitive content;
- audit and workflow-evidence visibility appropriate to authorized administrators.

### Security and operations

- server-side authorization;
- deployment-aware data ownership;
- protected object storage;
- malware-status gate before attachment release;
- application audit events;
- provider-neutral TransferAttestation evidence;
- conservative logging;
- rate/abuse controls;
- explicit disposition;
- synthetic fixtures only in development.

## Deferred capabilities

These are not current MVP commitments:

- Gmail, Outlook, or Zoho add-ins and shortcuts;
- automatic ingestion from external mailboxes;
- Google Drive, OneDrive, SharePoint, or similar right-click actions;
- SMS;
- native mobile applications;
- permanent records archiving;
- OCR or AI content processing;
- full-text indexing of message bodies or documents;
- advanced analytics or BI;
- arbitrary workflow builders;
- electronic signatures;
- payment workflows;
- customer-specific clinical integrations;
- Open Dental integration;
- broad SSO federation across many providers;
- complex delegated administration;
- cross-customer shared tenancy;
- unbounded file sharing.

## Explicitly outside current development scope

- real customer/PHI processing during development;
- representing a development build as compliance-ready;
- production email/domain routing changes;
- production authentication setup;
- production AWS provisioning before its separate release gate;
- paid-service purchases without approval.

## Roadmap gates

### Release 0.1 — Product & Architecture Foundation

Completed and merged. Establishes product, architecture, workflow-evidence, threat-model, authorization, retention, and provider-boundary decisions.

### Release 0.2 — Engineering Baseline

Completed and merged. Establishes executable project scaffolding, package/lockfiles, strict compilation, formatting/linting, unit/integration/architecture tests, browser and accessibility tests, dependency/security checks, secret detection, build validation, and required CI.

### Release 0.3 — Workflow Core Prototype

Completed and merged. Implements:

- authoritative thread lifecycle and optimistic-version semantics;
- explicit completion/disposition timestamps where applicable;
- distinct Opened and Downloaded audit evidence;
- append-oriented `TransferAttestation` plus explicit supersede/invalidate controls;
- fail-closed completion-policy evaluation;
- authoritative normalized actor, deployment, queue-scope, and action-permission checks;
- atomic local mutation + audit/evidence transactions;
- deterministic two-deployment isolation tests.

### Release 0.4 — Conversation & Queue Core Prototype

Implements the next provider-neutral business layer using synthetic/local persistence only:

- bounded queue configuration and routing categories;
- accountless external initiation as an application capability, with no public internet endpoint;
- atomic creation of a `NEW` thread, initial immutable external message, and minimized audit evidence;
- immutable bounded plain-text prototype messages;
- metadata-only authorized queue candidate views;
- authoritative staff open/read followed by chronological conversation retrieval;
- distinct Opened evidence on staff conversation open;
- authorized immutable staff replies with atomic message + activity + audit mutation;
- thread routing, last-activity, and bounded attention metadata;
- explicit preservation of candidate-view versus authoritative-access boundaries.

Release 0.4 does not implement per-user unread/read-position state. `NEW`, Opened, activity, and attention metadata are not treated as equivalent to unread status. A later durable read-position/read-receipt design must be reviewed before per-user unread semantics are implemented.

Release 0.4 also does not implement attachment retrieval. `ATTACHMENT_DOWNLOADED` remains synthetic workflow evidence only; its eventual production emission must occur only after successful authoritative retrieval validates deployment/thread/attachment ownership, current access authority, retrievable lifecycle state, and a release-eligible malware state such as `CLEAN`.

### Later prototype releases

Add provider-neutral external retrieval/reply authorization, attachment behavior, browser/API delivery, and additional local/synthetic adapters before production cloud adapters.

### AWS adapter releases

Implement approved AWS adapters without embedding AWS concepts into the domain layer.

### Regulated deployment readiness

Separate gate covering customer-owned infrastructure, contractual/BAA coverage, security operations, backup/recovery, logging, retention, incident response, production secrets, and customer responsibilities.

## Release 0.5 implemented development slice

Release 0.5 implements the first browser-driven development vertical slice without promoting it to a production feature surface:

- disabled-by-default local demo composition;
- minimal server-rendered synthetic external initiation form;
- server-generated opaque external participant/thread/message/audit identifiers;
- metadata-only synthetic staff queue;
- explicit authoritative Opened action plus non-mutating authorized conversation reads;
- chronological immutable message rendering;
- authorized expected-version staff reply;
- explicit optional NEW -> IN_PROGRESS Start work action;
- server-side HTML escaping, restrictive CSP, no-store demo caching, and same-origin mutation checks.

Staff reply is allowed only in NEW, IN_PROGRESS, AWAITING_EXTERNAL, and AWAITING_STAFF. COMPLETED, EXPIRED, and DISPOSED fail closed. Reply never automatically changes lifecycle state.

Still deferred: production authentication/sessions, real external identity/contact fields, AccessGrant/external retrieval, attachments and file handling, notifications, AWS adapters/infrastructure, durable production persistence, customer integrations, analytics, and regulated deployment readiness.

## Release 0.6 implemented attachment-safety core

Release 0.6 implements, with synthetic bytes only:

- provider-neutral Attachment metadata and five approved safety states;
- bounded per-deployment attachment policy for individual size, per-message count, declared media category/type, and extension;
- separate original display filename and derived safe-download filename;
- opaque provider-neutral protected-content references independent of filenames;
- a protected-content port plus process-memory development adapter;
- application-only ingestion that publishes new content as `QUARANTINED`;
- trusted SYSTEM scan-result handling for `CLEAN`, `MALICIOUS`, and `INDETERMINATE` outcomes;
- replay-safe/current-state attachment scan transitions;
- authoritative staff retrieval requiring live deployment/thread/message/attachment/queue/permission/state checks before content access;
- `ATTACHMENT_DOWNLOADED` creation only after protected content resolves successfully;
- staged-content compensation when metadata publication fails;
- deterministic failure coverage for partial content/metadata boundaries.

`ATTACHMENT_DOWNLOADED` remains independent from `THREAD_OPENED`, TransferAttestation, thread lifecycle, and completion. The old standalone workflow download-evidence operation is removed so future HTTP/browser code cannot bypass authoritative attachment retrieval.

Still deferred: browser upload/download delivery, content-signature/type detection, real malware scanning, production object storage, attachment deletion/disposition orchestration, AccessGrant/external retrieval, notifications, durable production persistence, AWS adapters/infrastructure, customer data/PHI, archive extraction, OCR, parsing, preview, and AI processing.

## Release 0.7 implemented AccessGrant core

Release 0.7 implements temporary external thread-read authority without exposing it through a browser or notification channel: provider-neutral AccessGrant metadata/policy; explicit `THREAD_READ` only; server-generated 256-bit one-time bearer secret; persisted versioned SHA-256 verifier only; bounded server-time expiry; authorized issuance and retained-record optimistic revocation; conservative authoritative validation on every use; an external conversation projection excluding internal queue, actor, lifecycle, audit, and administrative metadata; minimized grant evidence; and authoritative transaction-time enforcement of the per-message attachment-count policy under concurrent ingestion.

External attachment retrieval is deferred so it can reuse the Release 0.6 clean-attachment retrieval/download-evidence path. External reply is deferred until an explicit lifecycle eligibility rule is approved. Also still deferred: public retrieval routes, email-link/notification delivery, production authentication, production persistence, AWS adapters/infrastructure, customer data, PHI, and regulated-deployment readiness.

## Release 0.8 — external attachment retrieval core

Release 0.8 adds provider-neutral external attachment retrieval behind explicit `ATTACHMENT_READ` AccessGrant authority. `THREAD_READ` and `ATTACHMENT_READ` remain independent capabilities: neither implies the other, and current AccessGrant policy must explicitly permit every operation requested at issuance.

The browser-delivery trust boundary remains deferred. Release 0.8 adds no public grant URL, email delivery, capability cookie, public attachment endpoint, or external reply surface. A later release must separately review delivery of the bearer credential and HTTP response controls.

External attachment download remains evidence only: `Opened != Downloaded != Transferred/Filed != Completed`. Download does not create TransferAttestation and does not complete or otherwise transition a thread.

## Release 0.9 — external retrieval development slice

Release 0.9 adds the first disabled-by-default browser delivery adapter over the provider-neutral Release 0.7/0.8 external retrieval services. The synthetic path is credential POST -> short-lived HttpOnly same-origin capability cookie -> independently authorized conversation and attachment views -> POST-only attachment download.

This is not a production public portal or finalized credential-delivery architecture. `DEMO_EXTERNAL_RETRIEVAL_ENABLED=enabled` is required in addition to the existing synthetic demo gate, no credential issuance route is exposed, and production Internet exposure still requires deliberate abuse/rate controls, credential bootstrap design, production authentication/deployment review, and operational controls.

## Release 0.10 — External Reply Core Prototype

Release 0.10 adds provider-neutral AccessGrant-authorized external reply as an application/domain capability only. `THREAD_REPLY` is an explicit third AccessGrant operation alongside `THREAD_READ` and `ATTACHMENT_READ`; each authority remains independent and the current AccessGrant policy must explicitly permit every requested operation.

External reply is allowed only while the authoritative thread is `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, or `AWAITING_STAFF`. It fails closed while `COMPLETED`, `EXPIRED`, or `DISPOSED`. This is intentionally narrower than external read eligibility: a valid `THREAD_READ` grant may still read a `COMPLETED` conversation, but `THREAD_REPLY` cannot reply to it.

A successful external reply creates one immutable `EXTERNAL_TO_STAFF` plain-text message attributed to the AccessGrant's authoritative external participant. It advances thread activity and staff-attention timestamps without creating per-user unread/read-receipt state and without automatically changing lifecycle state. Browser reply delivery remains deferred to Release 0.11.
