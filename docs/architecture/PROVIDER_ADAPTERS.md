# Provider Adapter Contracts

## Principle

Secure Exchange owns product behavior. Providers supply replaceable infrastructure capabilities.

The domain/application layers consume narrow ports. Provider SDK types and configuration remain in adapter/infrastructure code.

## Approved AWS-first reference adapters

| Capability | Initial AWS reference | Purpose | Data exposed | Security/privacy considerations | Recurring cost characteristic | Lock-in risk | Replacement path |
|---|---|---|---|---|---|---|---|
| Staff identity | Amazon Cognito | Authenticate staff and supply trusted identity claims | staff identity/profile attributes needed for auth | token validation, MFA/policy, claim minimization | usage-based; none in 0.1 | medium | `IdentityProvider` adapter for another OIDC/SAML-capable provider |
| Notification | Amazon SES | Deliver non-sensitive notifications | destination address and non-sensitive template content | never include message/document content or secret grants | usage-based; none in 0.1 | low-medium | `NotificationProvider` adapter for SMTP/API provider |
| Object storage | Amazon S3 | Store protected attachments/content objects | encrypted protected objects and minimal metadata | scoped access, encryption, opaque keys, disposition | usage/storage/request based; none in 0.1 | medium | `ObjectStore` adapter to compatible/cloud object store |
| API/compute | Lambda + API Gateway | Execute application/API | request metadata and application processing data | least privilege, log minimization, runtime hardening | usage-based; none in 0.1 | medium | standard Node/Web API runtime adapter |
| Key controls | AWS KMS-backed encryption | Key management/encryption controls | encryption context/key operations, not plaintext by design | key policy, grants, rotation/administration | key/request based; none in 0.1 | medium-high | encryption/key-management abstraction and deployment-specific implementation |
| Malware scanning | GuardDuty Malware Protection for S3 | Scan uploaded objects | uploaded object content to AWS-managed scanning workflow | quarantine gate, result authenticity, failure behavior | usage-based; none in 0.1 | medium-high | `MalwareScanner` adapter |
| Infra/security logging | CloudTrail + CloudWatch | Provider/runtime/security telemetry | infrastructure metadata; minimized app logs | prevent sensitive payload logging; restrict log access/retention | ingestion/storage/query based; none in 0.1 | medium | structured logging/telemetry adapter |
| State store | DynamoDB | Persist workflow/application state | application metadata/state, audit records as designed | authoritative reads for security-sensitive decisions; encryption; IAM | usage/storage/request based; none in 0.1 | medium-high | repository/transaction abstractions; PostgreSQL adapter is primary alternative |

## Required application ports

Initial contracts are expected to include:

- `IdentityProvider`
- `NotificationProvider`
- `ObjectStore`
- `MalwareScanner`
- `InfrastructureLogger`
- `ThreadRepository`
- `MessageRepository`
- `AttachmentRepository`
- `AuditRepository`
- `AccessGrantRepository`
- `RetentionRepository`
- `ConfigurationRepository`
- `TransactionBoundary`
- `Clock`

Names may evolve during implementation, but responsibilities must remain narrow and provider-neutral.

## Adapter rules

- no AWS SDK type crosses into the domain;
- no provider error text is returned directly to end users;
- no provider credentials are stored in product configuration or the repository;
- adapters translate provider failures into controlled application errors;
- provider identifiers are treated as infrastructure details unless a stable product identifier is required;
- logs are minimized and must not include sensitive payloads, access secrets, or document contents;
- replacement paths are documented before a provider becomes production-authoritative.

## Notification contract

Notifications contain only enough information to tell the recipient that Secure Exchange requires attention.

Do not include:

- message body;
- attachment content;
- sensitive subject;
- patient/client name;
- sensitive filenames;
- secret bearer tokens in logged template variables.

Opaque retrieval entry points and access-grant handling are controlled by the application.

## Malware contract

The upload pipeline treats new attachments as unavailable until the scanning policy returns an allowed result.

The adapter must distinguish at least:

- pending;
- clean/allowed;
- malicious/rejected;
- scan failure/unknown.

Failure/unknown must fail closed for normal retrieval unless an explicitly approved administrative policy says otherwise.

## Release 0.12 production-delivery adapter responsibilities

Release 0.12 does not select a new infrastructure provider. It clarifies the additional provider-neutral responsibilities that a later production-delivery implementation must satisfy.

Names below are illustrative contracts, not authorization for implementation:

- `BootstrapChallengeRepository` — authoritative challenge lookup, keyed-verifier reference, attempt/lock state, expiry, one-time consume, reissue invalidation, and optimistic versioning;
- `ExternalSessionRepository` — opaque session lookup, one-way verifier, absolute/idle lifetime, revocation/invalidation, one-session-per-grant enforcement, and optional deployment access/security epoch;
- `BootstrapVerifier`/keyed-verifier port — compares a human-entered low-entropy bootstrap proof using customer-owned secret/key material held separately from ordinary state records;
- optional `IndependentVerificationProvider` — performs or coordinates a separately controlled challenge when deployment policy requires protection from compromised-mailbox access;
- `AbuseControl`/rate-limit adapter — supplies source/deployment/session/grant throttling without becoming authorization truth;
- `NotificationProvider` semantic intents — invitation, new-message/reply, expiry/reissue, and revocation notice using approved non-sensitive template data only;
- `SecurityTelemetry`/`InfrastructureLogger` — records bounded opaque identifiers and reason codes while applying the Release 0.12 sensitive-field exclusions.

A later implementation may combine repositories physically behind one state adapter, but must preserve the product distinctions among bootstrap challenge, browser delivery session, and authoritative `AccessGrant`.

### State-store responsibilities

The state adapter must be able to atomically consume a valid one-time bootstrap challenge and establish the new browser session, enforce failed-attempt/lock state, invalidate earlier challenges/sessions on reissue, and preserve AccessGrant revocation/expiry and existing expected-version/`AccessGrantAuthorityGuard` semantics. An index/cache result is never sufficient authorization.

The raw human-entered bootstrap proof and the raw 256-bit browser-session bearer must never be persisted. The bootstrap proof requires a keyed/non-reversible verifier design because it is human-entered and lower entropy; the uniformly random 256-bit session bearer may use a versioned SHA-256 verifier.

### Key/secrets responsibilities

Production bootstrap-verifier key material, notification credentials, object/state encryption keys, provider API credentials, and other runtime secrets are customer-owned infrastructure secrets. They must remain outside product configuration, source control, browser output, logs, and ordinary state-store records. The isolated-deployment reference model must not depend on one LDW-owned cross-customer master secret.

### Notification responsibilities

The adapter receives only the destination routing necessary for delivery and an approved non-sensitive notification intent/template payload. Invitation email may include the non-secret bootstrap locator. A same-mailbox one-time proof may be included only when policy is explicitly `MAILBOX_ONLY`; an `INDEPENDENT_CHALLENGE` proof is not copied into email.

No notification provider is authorized by Release 0.12. SES remains an AWS-first reference from the foundation, not a permanent product dependency.

### Object-storage and malware responsibilities

Production object storage remains private, encrypted, addressed through opaque product references, and coordinated with explicit disposition/lifecycle handling. Durable/public object URLs are not authorization. Retrieval continues only after authoritative resource/AccessGrant checks and the existing exactly-`CLEAN` safety gate.

Malware adapters must authenticate/validate result provenance, keep unknown/failure outcomes non-retrievable, and avoid copying raw scanner payloads into application audit.

### Recovery responsibilities

A provider adapter must document restore semantics before production approval. Restore/failover may not resurrect consumed bootstrap challenges, expired/revoked sessions, or revoked AccessGrants. Where monotonic revocation cannot be proven across restore, the deployment must support an access/security epoch or equivalent kill switch that invalidates pre-restore delivery authority before external access resumes.

### Customer ownership

Production provider accounts, runtime state/object resources, keys/secrets, notification sender credentials, infrastructure/security logs, and backup/recovery facilities belong in the customer's isolated production environment. LDW receives named role-based access needed for administration and support; shared credentials are not an adapter requirement.

See [External Delivery and Credential Bootstrap Boundary](EXTERNAL_DELIVERY_BOUNDARY.md) and [ADR-0005](../adr/0005-external-bootstrap-session-boundary.md).
