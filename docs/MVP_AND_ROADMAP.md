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
- attachment status and controlled download;
- lifecycle state transitions;
- basic aging/attention indicators;
- completion workflow;
- metadata search/filter appropriate to known access patterns.

### Administration

- queue/role configuration;
- retention/disposition configuration within supported bounds;
- file-type and size policy;
- product branding configuration;
- notification-template configuration for non-sensitive content;
- audit visibility appropriate to authorized administrators.

### Security and operations

- server-side authorization;
- deployment-aware data ownership;
- protected object storage;
- malware-status gate before attachment release;
- application audit events;
- conservative logging;
- rate/abuse controls;
- explicit disposition;
- synthetic fixtures only in development.

## Deferred capabilities

These are not Release 0.1 implementation commitments:

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

## Explicitly outside current scope

- production AWS provisioning in Release 0.1;
- real customer/PHI processing during development;
- representing a development build as compliance-ready;
- production email/domain routing changes;
- production authentication setup;
- paid-service purchases.

## Roadmap gates

### Release 0.1 — Product & Architecture Foundation

Documentation and engineering decisions only.

### Release 0.2 — Engineering Baseline

Expected to establish executable project scaffolding, package/lockfiles, strict compilation, formatting/linting, unit-test baseline, browser-test baseline, accessibility checks, dependency/security checks, secret detection, and CI.

### Prototype releases

Implement provider-neutral domain behavior and local/synthetic adapters first, then browser/API flows.

### AWS adapter releases

Implement approved AWS adapters without embedding AWS concepts into the domain layer.

### Regulated deployment readiness

Separate gate covering customer-owned infrastructure, contractual/BAA coverage, security operations, backup/recovery, logging, retention, incident response, production secrets, and customer responsibilities.
