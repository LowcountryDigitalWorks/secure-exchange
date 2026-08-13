# Threat Model

## Scope

This threat model covers the Secure Exchange MVP reference design, including public submission/retrieval, authenticated staff access, provider adapters, protected objects, application state, audit events, retention, and isolated customer deployments.

No real customer/PHI data is used in development.

## Assets

- message/document content;
- attachment objects;
- staff identities and sessions;
- external access grants;
- queue/thread metadata;
- lifecycle state;
- authorization mappings;
- application audit events;
- retention/disposition state;
- configuration;
- encryption/key controls.

## Actors and threat sources

### External sender

May be legitimate, mistaken, abusive, automated, or malicious.

Risks:

- oversized/unsupported uploads;
- malware;
- spam/flooding;
- malicious filenames/content types;
- attempted routing manipulation;
- stored input injection.

Controls:

- validation;
- size/count limits;
- rate/abuse controls;
- quarantine;
- malware scanning;
- output encoding;
- minimal routing surface.

### Staff user

May make mistakes or misuse legitimate access.

Risks:

- unauthorized queue access;
- inappropriate downloads;
- mistaken disposition/state changes;
- oversharing secure replies.

Controls:

- least privilege;
- role/queue authorization;
- server-side checks;
- audit events;
- explicit lifecycle rules;
- narrow download grants.

### Administrator

Has elevated configuration capability.

Risks:

- permissive authorization mapping;
- unsafe retention policy;
- weakened upload controls;
- compromised admin identity.

Controls:

- MFA/strong IdP policy in production;
- privileged-role separation where justified;
- configuration validation;
- audit of sensitive administrative actions;
- bounded security-sensitive settings.

### Unauthorized link recipient

May receive a forwarded, leaked, guessed, or browser-history-derived link.

Controls:

- opaque high-entropy grants;
- short expiry;
- revocation;
- no sensitive URL metadata;
- server validation;
- higher-assurance verification option/gate before regulated production.

### Compromised external email account

An attacker may see notification email.

Design consequence:

- ordinary email is not treated as a trusted confidential content channel;
- notifications contain no sensitive content;
- access-grant theft risk must be explicitly mitigated;
- the final external retrieval verification design must be reviewed before regulated production.

### Compromised staff identity

An attacker may have valid IdP credentials/session.

Controls:

- provider MFA/policy;
- least privilege;
- narrow role mappings;
- audit;
- short sessions as appropriate;
- administrative monitoring/revocation;
- server-side per-resource authorization.

### Malicious upload

Risks:

- malware;
- polyglot/mismatched content;
- parser/browser exploitation;
- decompression/archive abuse;
- unsafe preview.

Controls:

- protected quarantine;
- content/type validation;
- size limits;
- malware scanning;
- fail closed on unknown scan state;
- avoid unsafe server-side parsing in MVP;
- controlled download headers.

### Cross-deployment/tenant access

Preferred deployments are isolated, but software defects must still be considered.

Controls:

- `deploymentId` on authoritative records;
- deployment-bound repository methods;
- per-resource authorization;
- negative isolation tests;
- customer-owned isolated infrastructure;
- no shared product data plane in the reference architecture.

## Data at rest

Threats:

- stolen provider credentials;
- overly broad IAM;
- bucket/table exposure;
- snapshots/backups/log copies.

Controls:

- provider encryption/key controls;
- least privilege;
- protected object storage;
- access logging/telemetry;
- no public objects;
- explicit retention/disposition;
- deployment readiness review.

## Data in transit

Threats:

- interception;
- downgrade/misconfiguration;
- secret disclosure in URLs.

Controls:

- TLS;
- secure headers;
- no sensitive content in URLs;
- short-lived scoped retrieval authorization;
- provider endpoint validation.

## Logs and audit trails

Threats:

- accidental sensitive-content logging;
- log access abuse;
- misleading/incomplete evidence.

Controls:

- structured minimized logs;
- no message bodies/documents/access secrets;
- separate infrastructure telemetry from app audit semantics;
- authorization on audit views;
- documented retention.

## Retention/deletion

Threats:

- completed records retained indefinitely;
- object deleted but metadata/content replicas remain;
- TTL mistaken for timely deletion;
- stale disposition decisions.

Controls:

- application-controlled disposition;
- authoritative eligibility revalidation;
- object and state disposition workflow;
- audit outcome;
- TTL cleanup only as backstop;
- documented backup/log boundaries before production.

## Lost or forwarded links

Treat as credential compromise.

Controls:

- revoke;
- expire;
- narrow scope;
- avoid durable bearer links;
- do not expose content directly from notification URL without server-side grant validation.

## Abuse and rate limiting

Public endpoints face:

- enumeration;
- upload/storage exhaustion;
- mail amplification;
- brute force;
- automation.

Controls expected before production:

- per-source/deployment rate controls;
- request/body/file limits;
- anti-enumeration responses;
- notification throttles;
- abuse telemetry;
- optional bot mitigation appropriate to deployment.

## Availability/denial of service

MVP is not designed as a high-volume public file host. Quotas, limits, provider protections, and graceful failure are required.

## Residual risks and pre-production gates

The following require explicit resolution before a regulated production deployment:

- exact external retrieval verification strength;
- customer identity/MFA policy;
- BAA/subprocessor coverage;
- backup/recovery behavior;
- infrastructure log retention/access;
- incident response and operational ownership;
- production rate-limiting/bot controls;
- customer-specific retention policy.

## Release 0.5 local browser delivery controls

Release 0.5 introduces a deliberately local development browser adapter, disabled by default. Its primary accidental-exposure control is the explicit SECURE_EXCHANGE_SYNTHETIC_DEMO=enabled gate; it is not a production authentication control.

Additional development-delivery controls include:

- server ownership of deployment, queue authority, STAFF identity, permissions, and generated authoritative IDs;
- bounded form fields with no real contact/identity fields;
- POST-only mutations with POST/Redirect/GET;
- no GET mutation;
- Fetch Metadata same-origin validation when Sec-Fetch-Site is supplied; only same-origin is accepted;
- strict Origin/host/request-URL validation for non-browser callers without Fetch Metadata;
- fail-closed missing/cross-site mutation signals;
- HTML escaping of all rendered message/configuration text;
- restrictive CSP with form-action 'self' only in enabled demo mode;
- Cache-Control: no-store on demo routes;
- no client-side script, analytics, trackers, or external hosts;
- bounded generic error mapping without authorization details or message content.

These controls do not make the demo safe for customer/regulated data or public production exposure. Production authentication, session/CSRF design, rate limiting/bot controls, external identity verification, and deployment-specific security controls remain separate pre-production gates.

## Release 0.6 attachment-safety controls

Release 0.6 treats every supplied attachment as untrusted. Filename, extension, declared MIME type, and declared media category are not proof of actual content. The current policy gate only bounds declared metadata; production content-signature/type verification remains mandatory before arbitrary untrusted browser ingestion can be considered safe.

Content is staged under an opaque server-generated reference independent of the filename and is published as `QUARANTINED`. Only a validated clean normalized scan outcome can move the attachment to `CLEAN`; malicious results become `REJECTED`, and indeterminate/failure outcomes remain non-retrievable. Unknown/invalid/current-state-violating scan results fail closed.

Retrieval is metadata-authoritative and occurs before no object read: deployment, thread, staff authorization, queue scope, permission, message association, attachment association, safety state, and deletion state are all checked before protected bytes are requested. Object-store existence alone never grants access.

Audit intentionally excludes file bytes, message bodies, unrestricted filenames, provider storage paths, credentials, grant secrets, and raw scanner payloads. Release 0.6 uses synthetic bytes in process memory only and adds no disk persistence, localStorage, public URLs, inline preview, parser, archive extraction, OCR, or AI processing.

## Release 0.7 bearer-grant threat controls

Release 0.7 treats the future external bearer secret as a credential. It uses 256 bits of Web Crypto random material, returns the raw secret only at issuance, and persists only a versioned SHA-256 verifier. Password hashing is intentionally not used for this high-entropy random bearer value; guessing resistance comes from random entropy while the non-reversible verifier avoids storing the credential itself.

Threats include guessed/leaked grant IDs, stolen bearer secrets, replay after revocation, stale authorization after thread-state change, clock manipulation, verifier disclosure, and cross-deployment scope confusion. Controls include secret proof in addition to grant ID, authoritative deployment/thread lookup, explicit operation checks, current thread-state revalidation, server-controlled injectable time, bounded expiry, optimistic retained-record revocation, conservative external errors, and audit minimization.

Grant audit records contain the opaque grant ID and actor attribution where needed but never the raw secret or verifier. No bearer token is placed in a URL, repository fixture, documentation example, or browser route in Release 0.7 because public delivery is not yet implemented.

The attachment-count race is also addressed as a storage-exhaustion/data-policy correctness control: concurrent ingestion can no longer rely solely on a stale application count. The authoritative metadata transaction checks current policy plus resulting per-message count before publication; losing staged content is removed through compensation.

## Release 0.8 external attachment retrieval threats

Release 0.8 treats bearer-secret theft, operation confusion, cross-deployment/thread attachment access, identifier enumeration, stale/revoked/expired authority, unsafe attachment-state bypass, protected-content substitution or absence, and metadata/content length mismatch as explicit threats.

Mitigations include high-entropy server-generated bearer material with persisted one-way verifier only, explicit `ATTACHMENT_READ`, current policy enforcement at issuance, per-use grant and thread revalidation, authoritative message/attachment ownership checks, exactly-`CLEAN` retrieval, protected-content byte-length integrity validation, minimized audit, and conservative external denial responses.

No browser or email delivery mechanism exists in this release, so URL leakage, cookie capability handling, browser caching, response-header hardening, and delivery-channel replay controls remain a Release 0.9 trust-boundary review rather than being guessed here.
