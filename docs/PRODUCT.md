# Product Definition

## Purpose

Secure Exchange provides a simple, secure workflow for organizations that need to exchange messages and documents with external participants who cannot reasonably be forced into a complex collaboration platform.

The product focuses on the exchange workflow itself: intake, routing, conversation state, secure retrieval, lifecycle management, workflow evidence, audit semantics, retention/disposition, and configurable product UX.

Secure Exchange is also a reusable LDW implementation framework. It does not need to become a standalone SaaS product or replace a customer's existing Microsoft, Google, Zoho, or other productivity/mail platform to create value. The preferred commercial pattern is to keep the customer on the lowest practical adequate provider tier, configure that provider, and add only the narrow customer-owned Secure Exchange extension or integration the workflow actually requires.

## Target users

### External participant

An outside sender or recipient who needs to submit or retrieve a message or document without creating a full organizational user account.

### Staff user

An authenticated organization user who works from role-based queues, reads permitted threads, sends secure replies, manages lifecycle state, reviews opened/download evidence, records transfer/filing attestations when required, and completes workflow actions.

### Administrator

An authenticated organization user who configures queues, authorization mappings, retention settings, completion-policy settings, permitted file characteristics, branding, and operational product settings.

### System actor

Background application processes that perform approved tasks such as disposition, notification dispatch, malware-status handling, and audit generation.

## Product ownership boundary

Secure Exchange owns:

- domain semantics;
- queues and routing semantics;
- thread/message/attachment lifecycle;
- workflow status and state transitions;
- workflow-evidence semantics, including opened/read, download, and transfer/filing attestation evidence;
- application authorization policy;
- application audit semantics;
- retention/disposition policy and orchestration;
- product configuration;
- product UX.

Commodity providers should supply infrastructure primitives such as identity, object storage, encryption/key management, notification delivery, infrastructure logging, malware scanning, and compute.

Existing customer platforms should be reused where they are adequate. Secure Exchange may complement a customer's mail/productivity provider by using ordinary mail only for non-sensitive routing or notification while sensitive content remains in the customer-owned exchange workflow.

## Commercial and service model

Secure Exchange is not required to justify itself through standalone recurring software-subscription revenue.

LDW may create value through:

- provider and workflow assessment;
- customer-owned account and platform configuration;
- fixed-fee or hourly implementation;
- narrow customer-owned custom development;
- integration with the customer's authoritative systems;
- optional ongoing maintenance and support;
- standardized reusable deployment methods that lower future delivery and support cost.

A separate LDW pricing/service gate owns hourly rates, fixed-fee packaging, and support-retainer economics.

## Workflow evidence versus lifecycle

Secure Exchange intentionally distinguishes operational evidence from thread lifecycle.

At minimum:

- **Opened** records that an authorized actor opened/read the permitted thread context;
- **Downloaded** records that an authorized file download/retrieval occurred;
- **Transferred/Filed** is represented by an authenticated staff `TransferAttestation` when downstream transfer cannot be technically proven;
- **Completed** is the thread lifecycle state reached only after configured completion preconditions are satisfied.

**Opened != Downloaded != Transferred/Filed != Completed.** One fact must not be inferred solely from another. Product UX should make these facts visible where appropriate without turning each into a lifecycle state.

## Preferred deployment model

The preferred production model is one isolated deployment per customer in customer-owned infrastructure/accounts, with LDW using named and scoped administrative access where support is contracted.

The product remains deployment-aware internally so isolation assumptions are explicit and testable, but the reference model does not require a shared cross-customer data plane. LDW-managed hosting or a future shared service is optional only where it creates legitimate customer value and acceptable operational economics.

A common target architecture is:

customer-owned mail/productivity provider -> non-sensitive notification/routing -> customer-owned Secure Exchange portal -> customer workflow/integration -> downstream authoritative system -> temporary exchange disposition.

LDW should not build or operate its own SMTP/mail server merely to create this workflow.

## Current low-cost provider investigation

As of 2026-08-15, Zoho Mail Lite is the leading low-cost provider candidate for testing the provider-plus-extension model. This is a research direction, not a vendor commitment, partnership, production approval, or claim that every required control is available on every Mail Lite tenant.

Current public Zoho documentation supports the following investigation assumptions:

- Mail Lite is a paid custom-domain plan and paid plans support Email Routing;
- paid organizations can use Incoming Rules, including recipient-address matching and permanent rejection with an optional custom error message;
- Zoho Mail exposes OAuth-based REST APIs for reading, sending, and replying to mail;
- Zoho documents Strict TLS policies assignable to selected users/groups, with the feature released in phases and support involvement potentially required;
- Zoho publishes HIPAA-oriented Mail guidance and provides a BAA template on request.

Before any production healthcare recommendation, obtain written Zoho confirmation that the exact subscribed Mail Lite configuration is covered by the applicable BAA and that Strict TLS can be enabled as intended.

Two low-cost patterns remain candidates for synthetic/provider testing:

1. **Portal-only alias** — a records-style alias on an existing paid mailbox, with an Incoming Rule rejecting direct mail to that address using a custom response directing the sender to the customer-owned secure portal. This may avoid an additional mailbox license if the customer's exact configuration supports it.
2. **TLS-only dedicated intake mailbox** — a separate low-cost Mail Lite user with a Strict TLS policy scoped to that user, creating a cleaner boundary without imposing the policy on ordinary organizational mail.

Do not assume Zoho can simultaneously accept TLS-delivered mail while returning a custom portal-redirect rejection specifically for non-TLS delivery on the same address. Current public Incoming Rule conditions do not expose transport-TLS state. That combined behavior requires provider confirmation or controlled testing.

## First healthcare workflow candidate

Donovan Family Dentistry is a useful discovery/reference context for the first healthcare pilot, but no customer commitment is assumed and the product must not become a dental-specific fork.

A differentiated future workflow may be:

external provider -> Secure Exchange -> authorized staff validates patient association -> document transferred into Open Dental -> successful transfer/filing evidence recorded -> temporary Secure Exchange copy disposed according to policy.

Open Dental currently exposes document-insertion API paths that make this a plausible integration target, but the integration is not yet authorized for implementation.

## Regulated support and BAA boundary

Customer-owned infrastructure does not automatically remove LDW's potential Business Associate status.

If LDW's support, troubleshooting, integration, administration, or maintenance role can involve access to PHI, the engagement should assume that a client-specific BAA may be required before that access occurs. A BAA is a contractual agreement, not a certification or government-paid license.

The operating preference remains to minimize LDW exposure:

- customer-owned accounts, infrastructure, PHI, and backups;
- named/scoped LDW administration;
- least privilege;
- synthetic or sanitized development and troubleshooting whenever practical;
- no PHI in LDW repositories, chats, test fixtures, or ordinary support documentation;
- minimized sensitive content in logs;
- no shared credentials.

## Non-goals for the initial product

Secure Exchange is not initially intended to be:

- a general-purpose email server or mailbox replacement;
- a collaboration suite;
- a permanent electronic records-management system;
- a CRM;
- a patient portal;
- a clinical system;
- a payment processor;
- an e-signature platform;
- an analytics warehouse;
- an unrestricted file-sharing service;
- a full document search/indexing platform;
- a substitute for customer governance, contracts, BAAs, incident response, or regulated operational controls.

## Compliance posture

Secure Exchange must not claim HIPAA, CMMC, FedRAMP, or other compliance merely because it uses encryption or managed cloud services.

Regulated deployments require a documented end-to-end boundary covering vendors/subprocessors, contractual requirements, hosting, storage, identity, logging, backup/recovery, retention, incident response, administrative access, and operational responsibility.

## Product principles

- solve the customer's practical problem before optimizing for product revenue;
- augment existing adequate platforms rather than forcing replacement;
- conservative data exposure;
- role-based routing over person-specific workflow design;
- customer ownership of deployed data and infrastructure where practical;
- provider-neutral domain contracts;
- distinct authoritative workflow evidence rather than inferred downstream actions;
- low operating complexity;
- minimal dependencies;
- accessible responsive UX;
- synthetic-data-only development;
- explicit security and retention semantics.

## Release 0.5 local development delivery boundary

Release 0.5 adds a disabled-by-default **Synthetic Development Demo** as a local browser delivery adapter over the existing provider-neutral application services. It is a development surface for exercising the approved workflow and conversation model, not a production portal or a change to the product's production trust boundary.

The demo accepts only a permitted routing category and bounded synthetic message text for accountless initiation. It uses a server-held synthetic STAFF context for queue, open/read, reply, and the optional explicit Start work action. Browser input cannot choose staff actor IDs, permissions, deployment IDs, queue grants, or authoritative external/thread/message/audit identifiers.

Production authentication, real external identity/contact modeling, external secure retrieval/reply, attachments, notifications, customer data, PHI, and production infrastructure remain outside Release 0.5.

## Release 0.6 attachment-safety boundary

Release 0.6 adds the provider-neutral attachment safety core required before browser file transfer can be considered. The implemented boundary is application/integration-test driven and synthetic only. It introduces attachment metadata, bounded declared-metadata policy checks, quarantine and normalized scan outcomes, protected-content storage behind an application port, authoritative staff retrieval, and retrieval-coupled Downloaded evidence.

New content is never silently trusted. Successful ingestion stages synthetic bytes under an opaque content reference and atomically publishes attachment metadata in `QUARANTINED`. A clean normalized scan result is required before the normal retrieval service can return bytes. `PENDING_UPLOAD`, `QUARANTINED`, `REJECTED`, and `DELETED` all fail closed for normal retrieval.

Declared filename extension, media category, and MIME type are policy inputs only. Release 0.6 does not perform content-signature/file-format verification; production ingestion must add an authoritative content-classification/type-verification gate before untrusted uploads are released.

Arbitrary browser upload/download, real malware scanning, production object storage, AccessGrant, production authentication, customer data, PHI, and AWS infrastructure remain outside this release.
