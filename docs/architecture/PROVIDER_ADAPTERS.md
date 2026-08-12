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
