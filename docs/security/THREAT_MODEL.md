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
