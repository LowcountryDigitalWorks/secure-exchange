# External Delivery and Credential Bootstrap Boundary

## Status and scope

Release 0.12 defines the production delivery/security contract that a later implementation must satisfy before the synthetic external AccessGrant flows from Releases 0.7–0.11 can be exposed to real external participants.

This document is architecture only. It does not create a public portal, production credential, notification, state-store adapter, object-store adapter, malware scanner, cloud resource, customer deployment, or compliance claim.

The governing authorization rule remains unchanged:

**browser possession is delivery state, not application authorization truth.**

Every protected operation still re-enters the provider-neutral application layer and authoritatively validates deployment, thread, AccessGrant identity and proof, explicit operation, revocation, expiry, lifecycle/resource state, expected version where applicable, and the `AccessGrantAuthorityGuard` for reply mutation.

`THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` remain independent. No wildcard authority is introduced.

`Opened != Downloaded != Transferred/Filed != Completed` remains authoritative.

## Recommended production bootstrap architecture

The recommended production bootstrap separates three things that the synthetic development flow currently carries together:

1. a **bootstrap locator** used only to identify a pending bootstrap challenge;
2. a **one-time bootstrap proof** used only to exchange that challenge for browser delivery state;
3. a **browser session bearer** used only to present the resulting browser session to the delivery adapter.

None of those replaces the authoritative AccessGrant.

### URL decision

A production URL may contain only an opaque, non-secret bootstrap locator such as `bootstrapId`.

The one-time bootstrap proof, raw AccessGrant bearer, browser session bearer, verifier, or CSRF secret must **not** appear in a URL path, query, fragment, redirect target, generated hyperlink, referrer, or ordinary application log.

This deliberately rejects a magic-link design in which a usable bootstrap credential is embedded in the URL. A short lifetime, one-time exchange, redirect stripping, `Referrer-Policy`, and `Cache-Control` reduce URL-secret exposure, but they do not eliminate browser history, mail security scanner, link-expansion, reverse-proxy/access-log, screenshot, forwarding, and reputation-system exposure. Secure Exchange already has a clean no-active-secret-in-URL boundary, and Release 0.12 preserves it.

A locator may still be high entropy (at least 128 random bits) to resist enumeration, but it is not accepted as proof of authority.

### One-time bootstrap proof

The external participant enters a separately presented one-time code/proof on the Secure Exchange bootstrap page.

Reference properties for a future implementation:

- generated with a cryptographically secure random source;
- at least 50 bits of effective entropy for a human-entered code;
- short expiry, with **15 minutes** as the initial reference maximum;
- one successful use only;
- a maximum of **5 failed proof attempts per bootstrap challenge** before the challenge is locked/inactivated;
- verification through a non-reversible, keyed verifier so state-store disclosure alone does not permit practical offline code guessing;
- atomic consume + browser-session establishment so replay cannot create a second session;
- old outstanding challenges for the same grant invalidated on reissue;
- generic external failure behavior for unknown, wrong, expired, consumed, locked, or revoked challenges.

Because a human-entered code has lower entropy than the 256-bit AccessGrant/browser bearer, an unkeyed fast hash is not sufficient as its persistence boundary. A future adapter must use a keyed verifier such as HMAC with a customer-owned server secret/key held separately from the state store, or another reviewed verifier design with equivalent offline-guessing resistance.

The raw proof is never retained after issuance and is never written to audit, logs, notification telemetry, metrics labels, or provider error details.

### Verification policy levels

Secure Exchange must not describe two steps as two factors when both are available to the same compromised mailbox.

A future deployment policy may support two explicitly named assurance modes:

- **MAILBOX_ONLY** — the bootstrap locator and one-time code are delivered through the intended email mailbox. This mitigates URL-secret leakage and scanner/prefetch consumption but still treats mailbox possession as the sole delivery trust anchor. It is **not MFA** and does not mitigate mailbox compromise, forwarding of the complete message, or a scanner that can extract and actively replay both elements.
- **INDEPENDENT_CHALLENGE** — the email contains only the locator/notification and the one-time proof is delivered or established through a separately controlled channel or previously verified customer process. The delivery provider remains behind an application-owned contract; Release 0.12 selects no SMS, voice, identity, or other vendor.

A customer/deployment that requires protection against compromised-mailbox access must use `INDEPENDENT_CHALLENGE` or a separately approved stronger external identity mechanism. Mailbox-only bootstrap must not be represented as satisfying that threat.

### Pre-session BootstrapFormGuard

The proof POST consumes/updates bootstrap state and establishes a fresh browser session, so it is a state-changing request **before** any browser session exists. Session-bound CSRF proof cannot be a prerequisite to creating that same session.

The reference pre-session request-integrity control is a provider-neutral **`BootstrapFormGuard`**. The bootstrap GET renders a short-lived server-authenticated opaque form token that is bound to the intended bootstrap challenge and current browser flow without mutating authoritative challenge/application state.

The guard binds, at minimum, to:

- the intended `bootstrapId`/challenge selector;
- the current authoritative challenge version or equivalent replay generation;
- the exact expected Secure Exchange origin;
- a fresh unpredictable per-render nonce;
- an expiry of at most **10 minutes** and never beyond the underlying bootstrap challenge expiry.

The guard is authenticated with deployment-held application key material behind the provider-neutral key/secrets boundary. It appears only in the same-origin bootstrap form POST body. It is not placed in URLs, redirects, notifications, logs, audit, analytics, or provider-visible telemetry.

`BootstrapFormGuard` is request-integrity material only. It is **not** an AccessGrant, the one-time bootstrap authorization proof, a browser session, or application authorization. It cannot read a thread, enumerate or download attachments, send a reply, or turn the non-secret `bootstrapId` into authority.

## Bootstrap HTTP flow

The recommended server-rendered flow requires no active secret in the initial link:

```mermaid
sequenceDiagram
    participant N as Notification channel
    participant B as External browser
    participant D as Delivery adapter
    participant S as Authoritative state
    participant A as AccessGrant application service

    N->>B: Link containing non-secret bootstrapId
    B->>D: GET bootstrap page
    D-->>B: no-store proof form + BootstrapFormGuard; GET consumes nothing
    B->>D: POST bootstrapId + proof + BootstrapFormGuard + origin signals
    D->>D: validate exact Origin, Fetch Metadata, guard authentication/binding/expiry
    D->>S: validate challenge version, keyed verifier, attempts, expiry
    D->>A: revalidate current AccessGrant scope/state
    A-->>D: current allowed external authority or denial
    D->>S: conditional challenge update or atomic consume + create session verifier
    D-->>B: Set-Cookie __Host-sx_external + 303 clean session URL
    B->>D: GET clean session URL with cookie
    D->>S: validate session verifier/lifetime/revocation
    D->>A: revalidate requested AccessGrant operation
```

Important behaviors:

- GET never consumes, locks, advances, or authorizes a challenge and never establishes a browser session;
- rendering a stateless `BootstrapFormGuard` on GET does not change authoritative challenge/application state;
- email scanners/link previewers may safely prefetch the locator URL without burning the challenge;
- the bootstrap mutation is POST/non-GET only and requires exact expected Origin, same-origin Fetch Metadata when present, and a valid challenge/version-bound `BootstrapFormGuard` before proof verification;
- every bootstrap proof attempt that reaches authoritative challenge processing conditionally advances or consumes the challenge version/generation, which invalidates the submitted guard; concurrent/replayed submissions using that stale guard fail closed;
- if a failed proof leaves the challenge retry-eligible, the next form receives a fresh guard for the new authoritative challenge version;
- successful POST redirects to a fixed local URL that contains neither locator nor proof nor guard;
- responses carrying bootstrap/session forms use `Cache-Control: no-store, private` and `Referrer-Policy: no-referrer`;
- no third-party script, font, analytics, pixel, or embedded resource is required on bootstrap/session pages;
- any provider request/access logging must avoid storing proof or guard values and should minimize/normalize locator values where operationally practical.

## Browser session/capability contract

### Cookie

The reference production cookie is:

- name: `__Host-sx_external`;
- host-only by construction (`Domain` absent);
- `Secure`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/` as required by the `__Host-` prefix.

`SameSite=Lax` permits normal top-level navigation from a notification email while blocking cookie attachment to ordinary cross-site subrequests and POST forms. It is not treated as the CSRF control; established-session mutations have independent protections below.

The cookie contains a random session locator plus a **256-bit random session bearer**. The raw bearer exists only in the browser cookie and transient application memory. It is never persisted.

### Server-side session record

A production session repository may retain only bounded delivery metadata such as:

- opaque `sessionId`;
- deployment/thread/AccessGrant selectors;
- versioned SHA-256 verifier of the 256-bit random session bearer;
- established timestamp;
- last-authorized-activity timestamp;
- absolute expiry;
- revocation/invalidation timestamp and bounded reason code;
- optimistic version;
- deployment access/security epoch where implemented.

SHA-256 is acceptable for the browser-session verifier because the bearer itself is uniformly random with 256 bits of entropy. This is intentionally different from the keyed verifier required for the human-entered bootstrap code.

A database/state-store disclosure alone must not yield a usable browser bearer.

### Lifetime and renewal

Initial reference bounds:

- **20-minute absolute lifetime** from establishment;
- **10-minute idle lifetime** based on authoritative server time;
- the idle check may advance `last-authorized-activity` but can never move the absolute expiry;
- no silent or sliding extension of the absolute lifetime;
- after expiry, the participant must perform a new bootstrap/reissue flow.

Any future longer bounds require explicit security review and deployment policy limits.

### Concurrent sessions

The reference contract permits **one active external browser session per AccessGrant**. Establishing a new session invalidates the earlier session for that grant.

This intentionally favors minimized replay/forwarding exposure over multi-device convenience. Supporting concurrent sessions later requires an explicit policy and tests for revocation, audit interpretation, and compromised-link behavior.

### Fixation, rotation, logout, and revocation

- no pre-authentication browser token is promoted into an authenticated session;
- successful bootstrap creates a new random session ID/bearer;
- logout/end-access revokes the server-side session first, then expires the browser cookie;
- logout does not by itself revoke the authoritative AccessGrant;
- AccessGrant revocation/expiry always wins because every protected operation revalidates the current AccessGrant;
- reissue invalidates all outstanding bootstrap challenges for the grant and, by default, all existing browser sessions for that grant;
- suspected credential compromise requires AccessGrant revocation and issuance of a new AccessGrant/bootstrap, not merely cookie deletion.

## Per-request authorization after session establishment

The delivery adapter may resolve the session to the AccessGrant selectors and transient proof context, but the application layer remains authoritative.

For each operation the application must still validate, as applicable:

1. deployment;
2. authoritative thread;
3. AccessGrant identity;
4. current verifier/bearer proof represented by the validated session boundary;
5. explicit requested operation (`THREAD_READ`, `ATTACHMENT_READ`, or `THREAD_REPLY`);
6. AccessGrant revocation;
7. authoritative expiry;
8. current external-access/reply lifecycle rules;
9. current resource ownership and state;
10. expected thread/resource version where required;
11. `AccessGrantAuthorityGuard` for reply mutation.

A session row, session cookie, bootstrap record, URL locator, `BootstrapFormGuard`, candidate attachment row, prior successful request, or UI control is never sufficient authorization.

## CSRF and same-origin mutation protection

Production browser mutation protection has two phases because bootstrap establishes the browser session that later mutations use.

### Phase 1 — pre-session/bootstrap mutation

The bootstrap proof POST requires all of the following before challenge proof verification or session establishment:

- POST or another explicitly approved non-GET bootstrap mutation method; GET/HEAD never consume/lock/advance the challenge, establish a session, or authorize application access;
- exact expected `Origin` validation;
- Fetch Metadata validation when present, requiring `Sec-Fetch-Site: same-origin`;
- valid, unexpired server-authenticated `BootstrapFormGuard`;
- exact guard binding to the intended bootstrap challenge and its current authoritative version/generation.

The guard has no product authority. Each POST attempt that reaches authoritative challenge processing conditionally advances or consumes the challenge generation, invalidating that guard for replay. Unknown, stale, wrong-origin, cross-site, malformed, expired, or replayed request-integrity state fails with bounded generic external behavior.

### Phase 2 — established-session mutation

After successful bootstrap creates the real external browser session, every state-changing browser request requires all of the following:

- POST or another explicitly approved non-GET mutation method; GET/HEAD never perform product mutations;
- exact expected `Origin` validation;
- Fetch Metadata validation when present, requiring `Sec-Fetch-Site: same-origin`;
- a session-bound CSRF token/synchronizer proof generated by the application and verified server-side;
- a valid current external session;
- current authoritative AccessGrant operation checks.

The established-session CSRF proof does not replace current AccessGrant/application authorization, and the pre-session `BootstrapFormGuard` is never accepted as a session or product permission.

Requests missing required mutation signals fail closed. CORS is disabled by default for the external browser surface; do not add wildcard or credentialed cross-origin access. `SameSite` remains defense in depth rather than the sole CSRF control.

Browser responses should preserve:

- restrictive CSP with `default-src 'none'` and narrowly allowed same-origin resources;
- `form-action 'self'` only where forms are needed;
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY` defense in depth;
- `base-uri 'none'`;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- `Cache-Control: no-store, private` for bootstrap/session/content responses.

## External error behavior

Externally observable bootstrap/session/grant failures are intentionally bounded.

Do not reveal whether a bootstrap ID, grant, thread, attachment, session, or participant exists, or whether a specific credential was wrong, expired, consumed, revoked, or locked.

A generic response such as **“Secure access is unavailable. Request a new access invitation if you still need access.”** is appropriate.

HTTP status may distinguish a general request-throttling condition where operationally useful, but response text and timing should avoid fine-grained credential-state disclosure.

## Public Internet abuse controls

Application controls remain necessary even when an edge provider supplies additional protection.

### Mandatory application boundaries

- strict request/body/message/file size limits before expensive processing;
- per-bootstrap failed-attempt counter with lock after 5 failed proofs;
- per-session/per-grant reply and download quotas;
- per-deployment notification/reissue quotas;
- generic enumeration-resistant errors;
- no expensive object/scanner work before authority and policy checks that can occur earlier;
- server-side validation of all IDs, operations, and bounded form fields.

### Reference starting throttles

These are initial operational defaults to validate with real load/usage before production, not domain authorization semantics:

- bootstrap proof POST: 10 attempts per source IP per 10 minutes;
- bootstrap proof: 5 failed attempts total per challenge;
- reissue requests: 3 per grant per hour and a deployment-level ceiling;
- external reply: 10 accepted attempts per session per 10 minutes plus the existing message-size limit;
- attachment retrieval: 30 requests per session per 10 minutes plus deployment/object-size limits.

Repeated throttling may apply progressive delay or temporary source lockout. Rate-limit state may be approximate at the edge, but challenge consumption, AccessGrant state, and authorization remain authoritative application/state-store decisions.

Cloudflare-native or other provider edge controls may supplement these limits for request flooding, bot/scanner traffic, and coarse IP throttling, but they are replaceable infrastructure controls and are not a source of product authorization truth. Release 0.12 purchases or provisions none.

## Notification architecture

Future notification delivery remains provider-neutral behind an application-owned `NotificationProvider`/equivalent contract.

Supported semantic notification intents may include:

- secure-access invitation;
- new-message/reply notice;
- expiration/reissue notice;
- revocation notice when product policy calls for it.

Ordinary notification content must never include:

- PHI or other protected message content;
- message body;
- attachment content or sensitive filename;
- raw AccessGrant bearer;
- browser session bearer or persisted verifier;
- bootstrap-form or session CSRF material;
- provider credential/private key;
- unrestricted audit detail.

An invitation may carry the non-secret bootstrap locator URL. In `MAILBOX_ONLY` policy the same message may also carry the short-lived one-time bootstrap code, but that mode must be labeled operationally as mailbox-only assurance and not MFA. In `INDEPENDENT_CHALLENGE`, the proof is delivered/established by the separate verification channel and is not copied into email.

Provider delivery metadata must be minimized and templates must not put credential material into provider-visible subject lines, tracking parameters, or analytics. Open/click tracking is unnecessary for authority and should remain disabled unless separately justified.

## Production telemetry and audit boundary

### Never log

Production application/infrastructure telemetry must not record:

- bootstrap proof/code;
- raw AccessGrant bearer;
- browser session bearer;
- persisted verifier values;
- cookies or Authorization-style bearer material;
- `BootstrapFormGuard` or session-bound CSRF proof;
- reply/message body;
- attachment bytes or document contents;
- unrestricted external contact/address information;
- provider credentials, API tokens, private keys, or KMS plaintext material.

### Bounded security telemetry

Useful events may contain deployment-scoped opaque IDs, timestamp, operation, outcome, and bounded reason code:

- bootstrap challenge issued;
- bootstrap verification success;
- repeated bootstrap failure/lockout;
- session establishment;
- session expiration/logout/invalidation;
- AccessGrant revocation;
- reissue/compromise invalidation;
- unusual or denied download/reply attempt;
- application/edge abuse throttle;
- notification adapter failure/suppression;
- state/object/scanner/key-provider operational failure.

Repeated invalid proofs should be aggregated or rate-limited in telemetry so an attacker cannot create unbounded log volume.

Workflow audit remains distinct from infrastructure/security telemetry. Existing `THREAD_OPENED`, `ATTACHMENT_DOWNLOADED`, `MESSAGE_APPENDED`, TransferAttestation, lifecycle, and completion semantics are not replaced by session events.

## Production adapter responsibility boundaries

Release 0.12 selects no new provider. A future implementation must satisfy these provider-neutral responsibilities.

### Authoritative state store

Must support:

- authoritative AccessGrant lookup/version/revocation/expiry;
- bootstrap challenge lookup, keyed-verifier reference, attempt count, expiry, lock, one-time consume, reissue invalidation, and version/generation checks needed to invalidate replayed form guards;
- session lookup/verifier/lifetime/revocation;
- atomic bootstrap consume + session creation;
- session invalidation tied to AccessGrant revoke/reissue/deployment security epoch;
- optimistic/conditional operations needed by current workflow and `AccessGrantAuthorityGuard` semantics;
- minimized audit/security-event persistence where required.

The reference `BootstrapFormGuard` is stateless and does not require a separate pre-session authority/session record. Indexes/caches remain candidate views only and do not authorize access.

### Protected object storage

Must provide private, non-public storage with opaque object references, encryption at rest, bounded object metadata, integrity/byte-length validation, quarantine/release state coordination, and explicit lifecycle/disposition cleanup. Public or durable download URLs are not authorization truth.

### Malware scanning

Must authenticate/validate scan-result provenance, fail closed on unknown/failure, preserve `QUARANTINED` until an allowed result, and avoid copying raw scanner payloads into application audit.

### Key/secrets management

Must keep production notification credentials, keyed bootstrap-verifier material, `BootstrapFormGuard` authentication key material, encryption keys, and other infrastructure secrets in customer-owned secret/key-management facilities with named least-privilege access. No cross-customer shared master secret is permitted in the reference deployment model.

### Notification delivery

Receives only destination routing needed for delivery plus approved non-sensitive template data and the permitted bootstrap locator/code according to verification policy. It never receives message/attachment content simply to produce a notification.

## Backup, restore, and recovery implications

A restore must not resurrect stale browser authority.

Before a production adapter is approved, recovery design must ensure:

- outstanding bootstrap challenges and active browser sessions are invalidated after state restore/failover where monotonic continuity cannot be proven;
- absolute expiry is evaluated from current authoritative server time after restore;
- a rollback cannot silently make a previously revoked AccessGrant usable again;
- if the state technology cannot guarantee monotonic revocation across restore, the deployment has an authoritative **access/security epoch** or equivalent kill-switch that can invalidate all pre-restore grants/sessions and require controlled reissue;
- encrypted backups and logs follow customer-approved retention/access controls;
- restore testing proves object/state/audit consistency without restoring raw browser/bootstrap bearer material.

Recovery convenience must not override revocation truth.

## Customer-owned deployment ownership model

The preferred model remains one isolated production deployment per customer in customer-owned infrastructure.

### Customer-owned

A production customer should own, directly or through its cloud/provider accounts:

- public domain/DNS and TLS control for the customer deployment;
- application runtime and state/object/scanner resources;
- state-store data and backups;
- object storage and encryption/key-management resources;
- bootstrap/session verifier key material and application secrets;
- notification provider account/sender identity and credentials;
- infrastructure/security logs and retention policy;
- production recovery/backup configuration;
- customer-specific external-verification and retention policy decisions.

### LDW-managed through named access

LDW may administer the deployed product, releases, configuration, monitoring, and recovery procedures only through named role-based access granted by the customer. LDW should not require shared customer credentials or ownership of the customer's production accounts.

LDW-owned source repositories, release tooling, and product intellectual property remain separate from customer-owned runtime secrets/data.

Handoff must document ownership, named roles, revoke/recovery procedures, and replacement paths.

## Alternatives considered

### Email magic link containing a high-entropy one-time secret

**Rejected for the reference design.** High entropy, short expiry, one-time exchange, clean redirect, `no-referrer`, and `no-store` are useful, but the usable credential still appears in email URL handling, browser history, scanner/link-expansion systems, and potentially access logs. It also encourages accidental reuse of a URL credential as the browser capability.

### Email link plus separately delivered verification code

**Recommended for higher-assurance mode.** It meaningfully reduces compromised-mailbox risk only when the code is delivered/established through an independent channel. Provider selection is deferred.

### Email link plus user-entered known attribute

**Rejected as a primary proof.** Known attributes tend to be low entropy, guessable/discoverable, normalization-sensitive, and privacy-expanding. They may be useful as non-authoritative customer support context, not as the reference credential.

### Email link plus temporary code in the same email

**Accepted only as `MAILBOX_ONLY` assurance.** This is not MFA. It is still valuable because the active proof is not in the URL, GET prefetch does not consume it, and rate/attempt controls can apply to POST verification. It does not mitigate mailbox compromise or forwarding of the entire message.

### Persistent external account/login

**Deferred/rejected for the initial external-participant path.** It introduces password/passkey/MFA enrollment, account recovery, identity lifecycle, support, credential stuffing, dormant-account retention, and customer identity-administration obligations disproportionate to short-lived thread-scoped exchange. A future identity adapter can be added if repeated-user requirements justify it.

### Staff-issued verbal/offline one-time code

**Potential independent-challenge adapter.** It can improve assurance at low technical complexity for low-volume workflows but has staff-verification, support, and social-engineering risks. It remains a customer process/provider decision, not a hard-coded product assumption.

## Explicit non-goals of Release 0.12

This design does not enable or provision:

- public production routes or customer data;
- PHI;
- production bootstrap/session records;
- live email or verification-code delivery;
- SES, ZeptoMail, SendGrid, M365, Google, SMS, voice, or another provider;
- live OIDC/Cognito;
- S3, DynamoDB, KMS, Lambda, API Gateway, Cloudflare production resources, or IaC;
- malware scanner;
- OCR/AI/analytics/tracking;
- paid abuse service;
- compliance or production-readiness claim.

Expected recurring cost introduced by this architecture release: **$0**.
