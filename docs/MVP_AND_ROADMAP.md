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
