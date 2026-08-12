# Product Definition

## Purpose

Secure Exchange provides a simple, secure workflow for organizations that need to exchange messages and documents with external participants who cannot reasonably be forced into a complex collaboration platform.

The product focuses on the exchange workflow itself: intake, routing, conversation state, secure retrieval, lifecycle management, workflow evidence, audit semantics, retention/disposition, and configurable product UX.

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

## Workflow evidence versus lifecycle

Secure Exchange intentionally distinguishes operational evidence from thread lifecycle.

At minimum:

- **Opened** records that an authorized actor opened/read the permitted thread context;
- **Downloaded** records that an authorized file download/retrieval occurred;
- **Transferred/Filed** is represented by an authenticated staff `TransferAttestation` when downstream transfer cannot be technically proven;
- **Completed** is the thread lifecycle state reached only after configured completion preconditions are satisfied.

**Opened != Downloaded != Transferred/Filed != Completed.** One fact must not be inferred solely from another. Product UX should make these facts visible where appropriate without turning each into a lifecycle state.

## Preferred deployment model

The preferred production model is one isolated deployment per customer in customer-owned infrastructure.

The product remains deployment-aware internally so isolation assumptions are explicit and testable, but the reference model does not require a shared cross-customer data plane.

## First likely healthcare pilot

Donovan Family Dentistry is the likely first healthcare pilot/reference customer. It is not a product fork and does not authorize dental-specific business logic in the core.

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
