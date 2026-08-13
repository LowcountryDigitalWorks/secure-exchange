# Provider-Neutral Domain Model

This document defines business concepts. Provider-specific identifiers and SDK types belong in adapters.

## DeploymentContext

Represents the owning customer deployment/tenant context.

Key properties:

- `deploymentId` — opaque internal identifier;
- product configuration reference;
- authorization-policy reference;
- retention-policy reference.

Even isolated customer deployments retain this context to make ownership explicit and testable.

## Queue

A role-oriented work destination.

Properties include:

- queue identifier;
- display label;
- active/inactive state;
- allowed routing categories;
- authorization grants.

Queues are not individual mailboxes and should not primarily route by named person.

## Thread

The top-level exchange/work item.

Core properties:

- thread identifier;
- deployment identifier;
- queue identifier;
- lifecycle state;
- routing category;
- created/updated timestamps;
- attention timestamp;
- completion timestamp when applicable;
- disposition due timestamp when applicable;
- version for concurrency control.

### Thread lifecycle

Authoritative states:

- `NEW`
- `IN_PROGRESS`
- `AWAITING_EXTERNAL`
- `AWAITING_STAFF`
- `COMPLETED`
- `EXPIRED`
- `DISPOSED`

Allowed transitions are application-controlled. `DISPOSED` is terminal. `COMPLETED` schedules disposition but is not equivalent to deletion.

Typical transitions:

- `NEW -> IN_PROGRESS`
- `IN_PROGRESS -> AWAITING_EXTERNAL`
- `AWAITING_EXTERNAL -> AWAITING_STAFF`
- `AWAITING_STAFF -> IN_PROGRESS`
- active states -> `COMPLETED`
- eligible active/completed access grant expiry -> `EXPIRED` where the product policy requires thread expiry
- eligible retained state -> `DISPOSED`

Implementation must reject invalid or stale transitions using authoritative state/version checks.

### Lifecycle is distinct from workflow evidence

Thread lifecycle answers where the work item is in the Secure Exchange workflow. It does not encode every fact about how staff interacted with the thread or its files.

At minimum, Secure Exchange preserves these distinct facts:

- **Opened** — an authorized actor opened/viewed the thread or permitted content;
- **Downloaded** — an authorized attachment retrieval/download occurred;
- **Transferred/Filed** — an authenticated staff user attested that downstream transfer or filing occurred, when Secure Exchange cannot prove that downstream action directly;
- **Completed** — the thread entered the `COMPLETED` lifecycle state after all configured completion preconditions were satisfied.

**Opened != Downloaded != Transferred/Filed != Completed.** None of these facts may be inferred solely from another.

Opened and Downloaded are represented by distinct application audit/evidence events. Transferred/Filed is represented by a `TransferAttestation`. Completed remains a thread lifecycle state.

## Message

An immutable logical communication within a thread.

Properties:

- message identifier;
- thread/deployment identifiers;
- direction (`EXTERNAL_TO_STAFF` or `STAFF_TO_EXTERNAL`);
- actor reference/category;
- created timestamp;
- body-content reference/representation under the approved storage model;
- attachment references.

Messages are not edited in place. Corrections are new messages or explicit administrative events.

## Attachment

Metadata for a protected object.

Properties:

- attachment identifier;
- message/thread/deployment identifiers;
- original display filename handled as untrusted metadata;
- normalized media/type metadata;
- size;
- object-storage reference;
- malware state;
- created timestamp;
- disposition state.

Attachment safety states:

- `PENDING_UPLOAD`
- `QUARANTINED`
- `CLEAN`
- `REJECTED`
- `DELETED`

Only `CLEAN` attachments are eligible for normal authorized retrieval.

## AccessGrant

Represents temporary external access authority.

Properties:

- opaque grant identifier or verifier reference;
- deployment/thread scope;
- permitted operations;
- issued/expiry timestamps;
- revocation status;
- optional usage constraints.

Raw secret material must not be stored in ordinary logs or audit event details.

## Actor

Represents the initiator of an auditable action without forcing all external participants to have accounts.

Actor categories:

- external participant;
- authenticated staff;
- administrator;
- system process.

## TransferAttestation

An authoritative, provider-neutral business record created by an authenticated staff user when downstream transfer or filing cannot be technically proven by Secure Exchange itself.

A successful download does not create or imply a TransferAttestation.

Minimum properties:

- attestation identifier;
- deployment identifier;
- thread identifier;
- authenticated staff actor reference;
- attested timestamp;
- outcome such as `TRANSFERRED`, `FILED`, or `FAILED`;
- configured destination category appropriate to the deployment;
- completion-policy/configuration version or equivalent policy reference when needed for later validation;
- minimal non-sensitive structured metadata such as an approved reason/outcome code when justified.

Attestations must not contain message bodies, document contents, patient/client details, raw downstream record identifiers, credentials, or unrestricted free-form sensitive notes.

A TransferAttestation is append-oriented evidence. Corrections should supersede or invalidate a prior attestation through an explicit authoritative action rather than silently editing history.

When completion policy requires transfer/filing evidence, a completion attempt must validate an authoritative, current, successful attestation for the same deployment and thread. A missing, failed, superseded/invalid, wrong-deployment, or otherwise non-qualifying attestation does not satisfy that completion policy.

## AuditEvent

Append-oriented evidence of a meaningful product/security event.

Includes:

- event identifier;
- deployment identifier;
- event type;
- actor category/reference;
- target identifiers;
- timestamp;
- outcome;
- minimal structured metadata.

Audit events must not duplicate message bodies, document contents, secret grants, or unnecessary sensitive metadata.

Opened/read and successful download evidence use distinct event semantics. An Opened event is not download evidence; a download event is not transfer/filing evidence.

## RetentionPolicy

Defines supported retention/disposition behavior.

Includes:

- trigger event/state;
- duration;
- allowed administrative bounds;
- disposition action;
- policy version.

## ProductConfiguration

Provider-neutral configuration for branding, queues, file constraints, notification wording, workflow defaults, supported retention settings, and completion policy.

Completion policy may require a valid TransferAttestation before transition to `COMPLETED`.

Secrets and provider credentials are not ProductConfiguration.

## Repository and transaction abstractions

The domain/application layer depends on abstractions such as:

- `ThreadRepository`
- `MessageRepository`
- `AttachmentRepository`
- `AuditRepository`
- `TransferAttestationRepository`
- `AccessGrantRepository`
- `RetentionRepository`
- `ConfigurationRepository`
- `TransactionBoundary`

DynamoDB partition/sort keys, expressions, table names, GSIs, and AWS SDK types must not leak through these contracts.

## Release 0.6 implemented Attachment model

Release 0.6 makes the approved Attachment concept executable while keeping provider details outside the domain/application contract.

An Attachment records: opaque attachment/deployment/thread/message identifiers; untrusted original display filename; separately derived safe-download filename; normalized declared media category/type/extension; byte length; opaque protected-content reference; current safety state; created time; optimistic version; and bounded normalized scan-result metadata when present.

Authoritative states remain exactly:

- `PENDING_UPLOAD`
- `QUARANTINED`
- `CLEAN`
- `REJECTED`
- `DELETED`

The current application ingestion operation stages bytes and publishes the attachment directly as `QUARANTINED`; it does not expose browser staging or persist a client-driven `PENDING_UPLOAD` workflow. `PENDING_UPLOAD` remains a valid provider-neutral state for a later real ingestion/staging adapter. From `QUARANTINED`, a validated clean result transitions to `CLEAN`, a malicious result transitions to `REJECTED`, and an indeterminate result remains `QUARANTINED` with a versioned normalized scan record. New scan results from non-quarantined states fail closed. Exact replay of the same normalized scan-result reference/outcome is idempotent.

Only `CLEAN` with no deletion marker is eligible for normal retrieval. The other states are non-retrievable. Release 0.6 models `DELETED` as non-retrievable but deliberately does not introduce a general attachment deletion/disposition application operation.

Filename is never a storage locator. The original value is retained only as bounded untrusted display metadata; `safeDownloadFilename` removes directory semantics/control characters and is separately length-bounded for a future HTTP adapter.

## Release 0.7 implemented AccessGrant model

Release 0.7 makes the approved `AccessGrant` concept executable as temporary, provider-neutral external authority. An authoritative grant records an opaque grant ID, deployment/thread scope, one opaque external-participant actor reference, the access-policy reference used at issuance, a persisted one-way verifier digest, explicit permitted operations, issue/expiry timestamps, optional revocation timestamp, and optimistic version.

The Release 0.7 operation vocabulary contains only `THREAD_READ`, because external attachment retrieval and external reply are not implemented in this release. A vague unrestricted access operation is not used.

The browser/email-facing bearer secret and the stored grant record are deliberately different artifacts. The raw high-entropy secret is generated server-side and returned only at issuance. Only a versioned SHA-256 verifier of that random secret is persisted. The grant ID is neither the bearer secret nor a substitute for it. The opaque external-participant reference is actor attribution derived from authoritative thread messages; it is not client-supplied identity proof.

A grant remains separate from thread lifecycle. Current external access is allowed for `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, `AWAITING_STAFF`, and `COMPLETED`, subject to all other grant checks. `EXPIRED` and `DISPOSED` fail closed. Grant use, expiry, or revocation does not itself transition or complete a thread.

## Release 0.8 AccessGrant attachment authority

`AccessGrantOperation` now has two explicit values: `THREAD_READ` and `ATTACHMENT_READ`. They are independent scoped authorities; there is no wildcard or unrestricted operation. Existing thread-read authority never implies attachment-read authority.

Staff and external attachment retrieval use different authority sources but converge on one application safety invariant after authorization. Staff authority comes from current authenticated staff authorization plus queue scope and staff `ATTACHMENT_READ` permission. External authority comes from a currently valid, thread-scoped AccessGrant whose explicit operation is `ATTACHMENT_READ`.

The shared retrieval invariant authoritatively verifies message scope, attachment deployment/thread/message ownership, exactly `CLEAN` state with no deletion marker, protected-content availability, and byte-length equality with authoritative attachment metadata before `ATTACHMENT_DOWNLOADED` may be committed.

## Release 0.10 external reply semantics

`AccessGrantOperation` now has exactly three explicit values: `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY`. There is no wildcard or aggregate access operation, and existing grants do not silently acquire reply authority.

External reply eligibility is an explicit lifecycle rule separate from external read eligibility. `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, and `AWAITING_STAFF` are replyable. `COMPLETED`, `EXPIRED`, and `DISPOSED` are not. `COMPLETED` remains readable when a valid grant separately carries `THREAD_READ`.

A successful external reply creates one immutable `EXTERNAL_TO_STAFF` message whose actor reference is the AccessGrant's authoritative opaque `externalParticipantRef`. The caller cannot select actor identity, actor kind, deployment identity, message ID, audit ID, or authoritative timestamp. The existing bounded `PLAIN_TEXT` message representation remains authoritative for the body.

External reply does not transition lifecycle. It updates `updatedAt` and `lastActivityAt` for authoritative activity and advances `attentionAt` to reflect new external activity requiring staff attention. `attentionAt` is not a per-user unread marker or read receipt and does not assert that every staff user has not read the message.

## Release 0.11 delivery note

Release 0.11 adds no new domain authority or lifecycle state. It only exposes the existing Release 0.10 `THREAD_REPLY` capability through the synthetic/local browser adapter. `THREAD_REPLY` remains independent from `THREAD_READ` and `ATTACHMENT_READ`; successful reply still creates one immutable `EXTERNAL_TO_STAFF` message, advances external activity/attention metadata, and makes no automatic lifecycle transition.

