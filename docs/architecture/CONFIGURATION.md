# Configuration Model

## Goals

Configuration should adapt one generic Secure Exchange product to a customer without creating customer-specific forks.

Configuration is provider-neutral unless an adapter has a clearly isolated provider-specific section.

## Configuration categories

### Product identity and branding

Examples:

- organization display name;
- approved logo/brand asset references;
- color/theme tokens;
- support/contact wording.

Branding must not change security semantics.

### Queues and routing

Examples:

- queue identifiers and labels;
- allowed routing categories;
- role-to-queue grants;
- active/inactive queues;
- default routing behavior.

Routing should prefer roles/functions over named individuals.

### Workflow

Examples:

- permitted lifecycle behavior within the supported state machine;
- attention/aging thresholds;
- completion defaults and explicit completion preconditions;
- whether a qualifying authenticated staff `TransferAttestation` is required before completion;
- approved non-sensitive transfer/filing destination categories and outcome codes;
- optional canned response identifiers.

Configuration cannot enable otherwise-invalid state transitions. When a completion policy requires transfer/filing attestation, an indexed or cached workflow-evidence summary cannot substitute for authoritative attestation validation.

Opened/read, download, transfer/filing attestation, and completion remain distinct workflow facts regardless of configuration.

### Upload policy

Examples:

- permitted extensions/media classes;
- per-file size;
- total submission size;
- maximum file count.

Browser-supplied type information is untrusted and does not replace server-side validation/scanning.

### Retention/disposition

Examples:

- supported retention duration;
- trigger state/event;
- policy version.

Retention values must remain within product/deployment policy bounds. Configuration cannot redefine DynamoDB TTL as authoritative disposition.

### Notification wording

Templates are limited to non-sensitive notification content. Sensitive message/document content is never merged into ordinary email templates.

### Feature controls

Only documented, security-reviewed feature switches are allowed. Feature flags must not silently weaken authorization, malware gates, completion preconditions, or retention.

## Secrets are not product configuration

Passwords, tokens, private keys, client secrets, credentials, and raw access grants are not configuration files and must never be committed.

Production secret/key handling is an infrastructure responsibility and requires a separate approved implementation/deployment design.

## Configuration validation

Configuration must be schema-validated at startup/deployment and versioned where behavior affects authorization, lifecycle, completion, retention, or audit interpretation.

Invalid or ambiguous security-sensitive configuration must fail closed rather than silently defaulting to permissive behavior.

## Portability

The core consumes a normalized `ProductConfiguration`. Provider adapters may have separate infrastructure configuration, but provider fields must not leak into domain rules.

## Release 0.12 external-delivery policy boundary

A future production configuration model may expose only bounded, security-reviewed policy values for external delivery. Provider credentials and cryptographic secret material remain infrastructure secrets, not product configuration.

Expected normalized policy concepts include:

- external verification assurance: `MAILBOX_ONLY` or `INDEPENDENT_CHALLENGE`;
- bootstrap proof lifetime, bounded at or below the 15-minute reference maximum;
- bootstrap failed-attempt limit, bounded at or below the five-attempt reference maximum;
- browser-session absolute lifetime, bounded at or below the 20-minute reference maximum;
- browser-session idle lifetime, bounded at or below the 10-minute reference maximum and never exceeding absolute lifetime;
- browser-session concurrency policy, initially one active session per AccessGrant;
- deployment-level reissue/notification and external-operation abuse ceilings within product-supported ranges;
- approved notification intent/template identifiers containing only non-sensitive content.

Configuration must not:

- make a bootstrap locator sufficient authority;
- permit active bearer/bootstrap/session secrets in URLs;
- weaken explicit AccessGrant operation checks or create wildcard authority;
- label `MAILBOX_ONLY` delivery as MFA or independent-factor verification;
- let a session lifetime outlive or extend the authoritative AccessGrant lifetime;
- disable authoritative revocation/expiry/lifecycle/resource-state revalidation;
- turn edge/cache/rate-limit state into application authorization truth;
- disable the production mutation Origin/Fetch-Metadata/CSRF boundary;
- redefine backup restore as permission to resurrect stale credentials.

A customer/deployment that requires protection against a compromised notification mailbox must select `INDEPENDENT_CHALLENGE` or another separately approved stronger identity mechanism. The exact verification channel/provider is adapter configuration and remains separately gated.

Customer-owned keyed bootstrap-verifier material, browser/session signing or verifier secrets where applicable, notification provider credentials, encryption keys, and provider API credentials are never serialized into `ProductConfiguration`, repository files, client-visible HTML, or logs.

See [External Delivery and Credential Bootstrap Boundary](EXTERNAL_DELIVERY_BOUNDARY.md).
