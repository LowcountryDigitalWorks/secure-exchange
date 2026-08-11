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
- completion defaults;
- optional canned response identifiers.

Configuration cannot enable otherwise-invalid state transitions.

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

Only documented, security-reviewed feature switches are allowed. Feature flags must not silently weaken authorization, malware gates, or retention.

## Secrets are not product configuration

Passwords, tokens, private keys, client secrets, credentials, and raw access grants are not configuration files and must never be committed.

Production secret/key handling is an infrastructure responsibility and requires a separate approved implementation/deployment design.

## Configuration validation

Configuration must be schema-validated at startup/deployment and versioned where behavior affects authorization, lifecycle, retention, or audit interpretation.

Invalid or ambiguous security-sensitive configuration must fail closed rather than silently defaulting to permissive behavior.

## Portability

The core consumes a normalized `ProductConfiguration`. Provider adapters may have separate infrastructure configuration, but provider fields must not leak into domain rules.
