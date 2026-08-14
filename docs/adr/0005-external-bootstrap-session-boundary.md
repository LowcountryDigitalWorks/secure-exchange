# ADR-0005 — External Bootstrap and Browser Session Boundary

- Status: **Accepted**
- Date: 2026-08-13

## Context

Releases 0.7–0.11 establish provider-neutral `AccessGrant` authority and a disabled synthetic browser delivery slice. They intentionally do not decide how a real external participant receives initial access or how a production browser carries short-lived delivery state.

The production design must address mailbox compromise, forwarding, shared mailboxes/devices, wrong-recipient delivery, URL leakage, email scanners/prefetch, replay, session theft/fixation, revocation, CSRF, public-Internet abuse, and recovery without turning browser possession into application authorization truth.

## Decision

Use a **non-secret URL locator + user-entered one-time bootstrap proof + server-side verified browser session** architecture.

The authoritative AccessGrant remains separate and continues to own application operations.

### No active credential in the URL

A notification URL may contain only an opaque, high-entropy `bootstrapId` locator. It is not sufficient authority.

Do not place the one-time bootstrap proof, raw AccessGrant bearer, browser session bearer, verifier, or CSRF secret in a URL path, query, fragment, redirect, or generated hyperlink.

This rejects a conventional magic-link secret for the reference production design even when it is short-lived and one-time. The risk from browser history, forwarding, screenshots, mail scanners/link expansion, reputation systems, proxy/access logs, and accidental reuse as a session credential is unnecessary when a no-secret-in-URL flow is practical.

### Bootstrap proof

A future implementation must use a short-lived one-time proof that is entered by the participant and verified server-side.

Reference bounds:

- cryptographically random;
- at least 50 bits of effective entropy;
- 15-minute maximum lifetime;
- five failed proof attempts per challenge before lock/invalidation;
- raw proof never persisted;
- keyed/non-reversible verifier stored so state-store disclosure alone does not enable practical offline guessing;
- successful consume and browser-session creation are atomic;
- reissue invalidates prior challenges.

### Verification assurance modes

- `MAILBOX_ONLY`: locator and proof may both arrive through email. This is **not MFA** and does not mitigate mailbox compromise/complete-message forwarding, but it keeps the active proof out of the URL and avoids scanner/prefetch consumption on GET.
- `INDEPENDENT_CHALLENGE`: the proof is delivered/established through a channel independent of the notification mailbox. This is required when deployment policy explicitly requires protection against compromised-mailbox access.

Provider choice for an independent challenge remains deferred behind a provider-neutral contract.

### Browser session

A successful bootstrap creates a new random browser session; no pre-authentication token is upgraded in place.

Reference cookie:

- `__Host-sx_external`;
- `Secure`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- no `Domain` attribute.

The raw session bearer is 256 random bits and is never persisted. The state store keeps only a versioned one-way verifier plus bounded opaque session/grant/thread/deployment metadata, lifetime, revocation, and version fields.

Reference lifetime:

- 20-minute absolute maximum;
- 10-minute idle maximum;
- no silent/sliding extension of the absolute lifetime;
- rebootstrap/reissue is required after expiry.

The reference contract permits one active browser session per AccessGrant. Establishing a new session invalidates the previous session for that grant.

Logout revokes the server-side session before expiring the cookie. AccessGrant revocation/expiry always wins because every protected operation revalidates the authoritative grant.

### Authorization after bootstrap

Browser/session possession never becomes application authorization truth.

Every protected operation must still authoritatively revalidate the applicable deployment, thread, AccessGrant, proof/verifier boundary, explicit operation, revocation, expiry, lifecycle/resource state, expected version, and `AccessGrantAuthorityGuard` for reply mutation.

`THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` remain independent with no wildcard authority.

### CSRF and browser boundary

`SameSite` is defense in depth, not the mutation authorization mechanism.

State-changing browser requests require:

- non-GET mutation method;
- exact Origin validation;
- same-origin Fetch Metadata when present;
- session-bound CSRF/synchronizer proof;
- valid browser session;
- current AccessGrant/application authorization.

CORS remains closed by default. Bootstrap/session/content responses use conservative no-store/no-referrer/frame/CSP controls.

### Recovery

Reissue invalidates outstanding bootstraps and active sessions for the grant. Suspected credential compromise revokes the AccessGrant and requires a newly issued grant/bootstrap.

Production recovery must prevent backup restore from resurrecting revoked authority. If monotonic revocation cannot be guaranteed across restore, the deployment must provide an access/security epoch or equivalent mechanism that invalidates pre-restore grants/sessions before access resumes.

## Consequences

Benefits:

- preserves the existing no-active-secret-in-URL principle;
- tolerates GET prefetch/link scanning without consuming credentials;
- separates bootstrap, browser delivery, and AccessGrant authority;
- allows mailbox-only and independent-channel assurance without hard-coding a provider;
- keeps database disclosure from directly yielding browser credentials;
- gives explicit revocation/reissue/recovery semantics;
- avoids persistent external-account lifecycle for short-lived exchanges.

Costs/tradeoffs:

- one extra user-entered bootstrap step;
- independent verification requires customer process/provider support when enabled;
- session/bootstrap repositories and rate-limit state are required in a later implementation;
- one-session-per-grant may require reissue when a participant changes devices.

## Rejected/deferred alternatives

- **Magic link with usable secret in URL:** rejected for the reference design because URL handling creates avoidable leakage/prefetch/history/logging risk.
- **Known attribute as proof:** rejected as primary authority because it is generally low entropy, privacy-expanding, and guessable/discoverable.
- **Temporary code in same email:** permitted only as `MAILBOX_ONLY`, explicitly not MFA.
- **Persistent external account/login:** deferred until repeated-user requirements justify enrollment, recovery, credential-stuffing, MFA, and identity lifecycle overhead.

## Detailed design

See [External Delivery and Credential Bootstrap Boundary](../architecture/EXTERNAL_DELIVERY_BOUNDARY.md) for trust flows, session contract, abuse controls, notification/logging rules, adapter boundaries, and customer-owned deployment ownership.
