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

Implements the first provider-neutral business behavior with synthetic/local persistence only:

- authoritative thread lifecycle and optimistic-version semantics;
- explicit completion/disposition timestamps where applicable;
- distinct Opened and Downloaded audit evidence;
- append-oriented `TransferAttestation` plus explicit supersede/invalidate controls;
- fail-closed completion-policy evaluation;
- authoritative normalized actor, deployment, queue-scope, and action-permission checks;
- atomic local mutation + audit/evidence transactions;
- deterministic two-deployment isolation tests.

It deliberately adds no external submission/retrieval surface, production identity, attachment/object workflow, AWS adapter, or production infrastructure.

### Later prototype releases

Add provider-neutral external/browser/API workflow behavior and additional local/synthetic adapters before production cloud adapters.

### AWS adapter releases

Implement approved AWS adapters without embedding AWS concepts into the domain layer.

### Regulated deployment readiness

Separate gate covering customer-owned infrastructure, contractual/BAA coverage, security operations, backup/recovery, logging, retention, incident response, production secrets, and customer responsibilities.
