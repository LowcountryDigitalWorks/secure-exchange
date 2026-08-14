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

## Release 0.9 browser delivery threats

The synthetic delivery adapter explicitly addresses bearer leakage through URLs/history/referrers, cross-site form submission, overly broad cookies, stale browser state after revocation/expiry, response-header injection, inline-content execution, frame embedding, cache persistence, and accidental operation broadening.

Mitigations include POST-only credential presentation, no bearer in redirects or generated links, host-only HttpOnly Strict cookies scoped to the external-development namespace, Secure on HTTPS, same-origin POST validation, per-use AccessGrant revalidation, server-side HTML escaping, restrictive CSP/frame protections, no-store/no-referrer headers, defensive attachment disposition, and no request-body/Cookie/secret logging. The release intentionally does not claim anonymous Internet safety: production abuse/rate controls, email/bootstrap delivery, production identity/deployment, and operational monitoring remain unresolved gates.

## Release 0.10 external reply threats

Release 0.10 explicitly addresses operation-confusion/privilege broadening, stale grant use after lifecycle change, external actor spoofing, sensitive reply-body leakage, and partial publication during concurrent mutation.

Controls include a distinct `THREAD_REPLY` operation with policy opt-in, use-time bearer/scope/revocation/expiry revalidation, a separate domain reply-state rule that excludes `COMPLETED`, grant-derived external actor attribution, bounded plain-text validation, server-generated identifiers/time, minimized audit with no body/secret/verifier, and expected-version atomic message/thread/audit commit.

`attentionAt` records staff-facing attention to new external activity only; it is not a global unread/read-receipt assertion. Release 0.10 adds no browser reply route, upload capability, email bootstrap, public deployment, production identity/session, or cloud infrastructure; those delivery/abuse controls remain later trust-boundary work.

## Release 0.11 synthetic browser reply boundary

The reply form increases only the disabled synthetic/local browser development surface. CSRF resistance continues to rely on the existing strict same-origin mutation check plus the host-only `HttpOnly`, `SameSite=Strict`, path-scoped capability cookie. No permissive CORS is added. Capability secrets, verifier material, and reply contents are excluded from URLs and redirects. The UI is not an authorization boundary; stale UI must still fail at the authoritative application/store transaction.

Production Internet exposure, abuse/rate controls, production authentication, credential bootstrap, notification delivery, and operational monitoring remain separate future gates.

## Release 0.12 production delivery threat analysis

Release 0.12 resolves the production credential-bootstrap/session design boundary while creating no production surface. The following threats remain in scope for any later implementation.

### Forwarding, screenshots, wrong-recipient delivery, and shared mailboxes

Threats:

- a recipient forwards the invitation or a screenshot;
- the notification is sent to the wrong mailbox;
- multiple people legitimately or accidentally share a mailbox;
- a shared mailbox member uses a locator/code intended for another individual.

Controls:

- notification contains no protected content;
- URL contains a non-secret opaque locator only;
- bootstrap proof is one-time, short-lived, attempt-limited, and separately entered;
- reissue invalidates prior challenges and sessions;
- one active session per AccessGrant limits parallel replay;
- externally visible errors do not disclose challenge/grant existence;
- customer policy may require `INDEPENDENT_CHALLENGE` for stronger recipient verification.

Residual risk: `MAILBOX_ONLY` cannot establish a unique human identity when the mailbox itself is shared or the full message is forwarded. It must not be described as MFA or proof against mailbox compromise.

### Compromised mailbox

Threat: an attacker controlling the intended mailbox can read notification content and may initiate access.

Controls:

- ordinary email still carries no sensitive message/attachment content;
- a usable secret is not in the URL;
- `INDEPENDENT_CHALLENGE` keeps the proof outside the mailbox when deployment policy requires this threat to be mitigated;
- AccessGrant/session expiry and explicit revocation bound exposure;
- compromise response revokes and reissues the AccessGrant rather than merely clearing a cookie.

Residual risk: same-email locator + code remains mailbox-only assurance. Two UI steps from one compromised mailbox are not two factors.

### Browser history, referrer, URL logging, link expansion, and reputation systems

Threats:

- URLs may be retained by browser history, mail gateways, proxies, reverse proxies, reputation systems, support screenshots, or observability products;
- automated security scanners may prefetch or expand links before the human recipient opens them.

Controls:

- active bootstrap proof, raw AccessGrant bearer, browser session bearer, verifier, `BootstrapFormGuard`, and session CSRF token never enter URL path/query/fragment/redirect;
- GET of the locator page cannot consume, lock, advance, or establish authority;
- successful proof POST redirects to a fixed local URL without locator/proof/guard material;
- bootstrap/session/content responses use `Referrer-Policy: no-referrer` and `Cache-Control: no-store, private`;
- bootstrap/session pages need no third-party analytics/tracking resources;
- provider/request logging must never record proof/guard/body/cookie secrets and should minimize locator retention where operationally practical.

### Automated scanner active submission

Threat: a sufficiently invasive email-security system or compromised mailbox automation may extract both a same-email locator and code and actively submit them.

Control/limit: `MAILBOX_ONLY` does not claim to stop this. Deployments requiring protection from this class of mailbox compromise use an independent challenge or separately approved stronger external identity mechanism.

### Bootstrap guessing/enumeration

Threats:

- brute-force proof guessing;
- challenge/AccessGrant enumeration;
- distributed invalid submissions intended to exhaust logs or lock legitimate users.

Controls:

- opaque locator with at least 128 random bits;
- proof with at least 50 bits effective entropy;
- keyed/non-reversible verifier held separately from the state store;
- maximum five failed proof attempts per challenge;
- per-source and per-deployment request throttles plus progressive delay/temporary lock as appropriate;
- generic external errors;
- bounded/rate-limited security telemetry;
- reissue path with its own quotas.

### State-store disclosure and offline guessing

Threats:

- attacker steals state records containing bootstrap/session verifier material;
- lower-entropy human-entered proof is attacked offline.

Controls:

- raw proof and raw session bearer are never persisted;
- bootstrap proof uses keyed verifier with customer-owned key/secret stored separately from the state store;
- uniformly random 256-bit browser-session bearer uses a one-way verifier and is impractical to brute force from the verifier alone;
- no cross-customer shared verifier master secret in the isolated-deployment reference model.

### Session theft and fixation

Threats:

- cookie theft or shared-device reuse;
- attacker fixes a pre-auth session and causes the victim to upgrade it;
- stale session remains after logout/reissue/revocation.

Controls:

- fresh random session ID/bearer only after successful bootstrap; no pre-auth token or `BootstrapFormGuard` is upgraded;
- `__Host-` host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookie;
- 20-minute absolute / 10-minute idle reference lifetime with no silent absolute renewal;
- one active session per AccessGrant;
- server-side revocation before cookie clearing;
- AccessGrant revalidation on every protected request;
- reissue invalidates sessions; grant revocation/expiry wins over local browser state;
- no bearer in localStorage/sessionStorage/IndexedDB or URL.

Residual risk: an attacker who steals an active browser cookie may use it until session/AccessGrant invalidation; TLS, endpoint/browser hardening, short lifetime, revocation, and minimized session scope bound rather than eliminate this risk.

### CSRF and cross-origin request abuse

Threat: a hostile origin attempts to induce either the pre-session bootstrap proof POST or a later cookie-backed session mutation.

Controls are explicitly two-phase.

**Pre-session/bootstrap:**

- bootstrap mutation is POST/non-GET only;
- exact expected Origin validation;
- Fetch Metadata requires `same-origin` when present;
- a short-lived server-authenticated `BootstrapFormGuard` is bound to the intended challenge, current challenge version/generation, expected origin, fresh per-render nonce, and bounded expiry;
- the guard is required before bootstrap proof verification but grants no authority itself;
- each authoritative proof attempt advances or consumes the challenge generation, making the submitted guard stale for replay;
- GET may render a stateless guard but does not mutate authoritative challenge/application state, consume a challenge, establish a session, or authorize access.

**Established session:**

- mutation is non-GET;
- exact Origin validation;
- Fetch Metadata requires `same-origin` when present;
- session-bound CSRF/synchronizer proof;
- valid current external browser session;
- current authoritative AccessGrant/application authorization.

`BootstrapFormGuard`, session CSRF proof, browser-session possession, and `SameSite` are browser/request-delivery controls only. None widens `THREAD_READ`, `ATTACHMENT_READ`, or `THREAD_REPLY`. SameSite alone is not accepted as the CSRF boundary. CORS remains closed by default, with restrictive CSP `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, and frame-header defense in depth.

### Anonymous Internet request flooding and abuse

Threats:

- request flooding;
- repeated bootstrap attempts;
- reissue/mail amplification;
- external reply spam;
- attachment retrieval abuse;
- oversized payload attempts and resource exhaustion.

Controls:

- application request/body/message/file limits;
- per-challenge failure count;
- per-source/bootstrap/session/grant/deployment throttles;
- reissue/notification quotas;
- authorize before expensive object/scanner work where possible;
- generic failures and bounded log volume;
- optional replaceable edge protections such as Cloudflare-native rate/bot controls.

Release 0.12 provisions or purchases no edge protection and the documented starting thresholds require operational validation before a production deployment.

### Notification leakage/tracking

Threats:

- notification provider sees sensitive content;
- tracking pixels/click parameters create unnecessary external telemetry;
- provider logs capture active credentials.

Controls:

- provider-neutral minimal notification intent;
- no PHI/message body/attachment content/sensitive filename;
- no AccessGrant/session/verifier/CSRF or `BootstrapFormGuard` material;
- invitation URL contains locator only;
- click/open tracking remains off unless separately justified;
- independent-challenge proof is not copied into notification email.

### Backup/restore revocation rollback

Threat: restored state predates a grant/session revocation or challenge consumption and silently resurrects authority.

Controls:

- restore design explicitly invalidates outstanding bootstrap/session delivery state when monotonic continuity cannot be proven;
- current authoritative server time always enforces expiry;
- AccessGrant revocation must remain monotonic across recovery;
- deployment access/security epoch or equivalent kill switch invalidates pre-restore grant/session authority where the state technology cannot otherwise prove monotonic revocation;
- restore testing covers state/object/audit consistency and revocation behavior.

### Customer/LDW operational ownership

Threats:

- shared administrative credentials;
- LDW-owned cross-customer runtime secrets;
- ambiguous responsibility for keys, notification sender, backups, or incident response.

Controls:

- customer-owned isolated production infrastructure;
- customer-owned runtime data, keys/secrets/verifier material, notification account/credentials, logs, backups, and policy decisions;
- LDW named role-based access only;
- handoff/recovery documentation and revocation paths;
- no cross-customer shared master secret required by the reference design.

## Release 0.12 residual decisions and later gates

Release 0.12 resolves the product-level bootstrap/session trust contract but does not claim production or regulated readiness. Later gates still must resolve and validate, for each production deployment:

- the actual independent verification channel/process when required;
- production provider adapters and IaC;
- abuse thresholds and edge controls under realistic traffic;
- notification provider security/contractual posture;
- backup/recovery implementation and restore evidence;
- operational monitoring/incident response responsibilities;
- customer identity/MFA policy for staff;
- contractual/BAA/subprocessor coverage where applicable;
- customer retention/log-access requirements.

See [External Delivery and Credential Bootstrap Boundary](../architecture/EXTERNAL_DELIVERY_BOUNDARY.md) and [ADR-0005](../adr/0005-external-bootstrap-session-boundary.md).
