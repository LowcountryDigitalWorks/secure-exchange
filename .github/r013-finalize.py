from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/application/external-session-service.ts",
    """    const absoluteExpiresAtMs = Math.min(\n      Date.parse(at) + BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,\n      Date.parse(target.grant.expiresAt),\n    );""",
    """    const absoluteExpiresAtMs =\n      Date.parse(at) + BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000;""",
)
replace_once(
    "src/application/external-session-service.ts",
    "export interface LogoutBrowserSessionInput extends PresentBrowserSessionInput {}",
    "export type LogoutBrowserSessionInput = PresentBrowserSessionInput;",
)

test_path = Path("tests/integration/external-session-service.test.ts")
test_text = test_path.read_text()
marker = 'it("rolls back challenge consumption and session creation together on transaction failure"'
start = test_text.index(marker)
next_test = test_text.find("\n  it(", start + len(marker))
end = len(test_text) if next_test < 0 else next_test
block = test_text[start:end]
block = block.replace(
    "const { challenge } = await issueChallenge(fixture);",
    "const { grant, challenge } = await issueChallenge(fixture);",
    1,
)
block = block.replace(
    "(await issueExternalGrant(makeExternalSessionFixture())).grantId",
    "grant.grantId",
    1,
)
test_path.write_text(test_text[:start] + block + test_text[end:])

expiry_path = Path("tests/integration/session-backed-access-grant-expiry.test.ts")
expiry_text = expiry_path.read_text()
expiry_text = expiry_text.replace(
    """  expect(storedSession).toBeDefined();\n  expect(\n    isBrowserSessionActiveAt(storedSession!, \"2026-08-14T12:15:00.000Z\"),\n  ).toBe(true);""",
    """  if (storedSession === undefined) {\n    throw new Error(\"Expected authoritative browser session.\");\n  }\n  expect(\n    isBrowserSessionActiveAt(storedSession, \"2026-08-14T12:15:00.000Z\"),\n  ).toBe(true);""",
)
expiry_path.write_text(expiry_text)

replace_once(
    "docs/MVP_AND_ROADMAP.md",
    "Production mutation design requires Origin + Fetch Metadata + session-bound CSRF proof and keeps CORS closed by default.",
    "Production mutation protection is explicitly two-phase: pre-session bootstrap uses exact Origin + same-origin Fetch Metadata when present + `BootstrapFormGuard`; established-session mutations use exact Origin + same-origin Fetch Metadata when present + a session-bound CSRF/synchronizer proof. CORS remains closed by default.",
)

roadmap = Path("docs/MVP_AND_ROADMAP.md")
roadmap_text = roadmap.read_text()
release_heading = "## Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype"
if release_heading not in roadmap_text:
    roadmap.write_text(
        roadmap_text
        + """

## Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype

Release 0.13 implements the Release 0.12 delivery-state core without creating a public browser surface. It adds provider-neutral `BootstrapChallenge` and `BrowserSession` models, a copy-on-write `ExternalSessionStore`, keyed one-time bootstrap-proof verification, stateless challenge/generation-bound `BootstrapFormGuard`, atomic challenge consume + session creation, one-active-session-per-AccessGrant replacement, server-side logout, reissue invalidation, and exact idle/absolute session expiry.

The bootstrap locator, form guard, one-time proof, browser-session bearer, and AccessGrant remain separate. Raw bootstrap proof, form guard, and browser-session bearer are never persisted; the lower-entropy proof uses a keyed HMAC-SHA-256 verifier with injected key material, while the uniformly random 256-bit session bearer uses a SHA-256 verifier. No workflow audit event stores either verifier or any credential material.

A validated browser session creates only an application-owned session binding. Session-backed `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` still reload the current AccessGrant and thread, preserve operation independence, current revocation/expiry/lifecycle checks, the Release 0.10 `AccessGrantAuthorityGuard` for reply mutation, and the Release 0.6/0.8 exactly-`CLEAN` protected-content retrieval path. The existing raw AccessGrant synthetic development path remains unchanged.

Release 0.13 remains synthetic/local and adds no public bootstrap route, recipient UI, cookie issuance, notification provider, customer data/PHI, cloud adapter/resource, abuse service, analytics, or paid dependency. Expected recurring cost remains **$0**.
"""
    )

additions = {
    "docs/architecture/DOMAIN_MODEL.md": """

## Release 0.13 bootstrap and browser-session delivery state

`BootstrapChallenge` is a deployment/thread/AccessGrant-bound delivery record containing an opaque bootstrap locator, keyed proof-verifier metadata, verification mode, authoritative issued/expiry times, failed-attempt count, maximum attempts, consumption/invalidation state, challenge generation, and optimistic version. The raw bootstrap proof is returned only at issuance and is never stored. Each accepted proof attempt either advances generation/version on failure or consumes the challenge on success.

`BrowserSession` is separate delivery state containing an opaque session ID, deployment/thread/AccessGrant binding, SHA-256 verifier of a fresh 256-bit bearer, establishment time, last authorized activity, absolute expiry, invalidation state/reason, and optimistic version. Session state carries no AccessGrant operation set and therefore cannot become wildcard application authority.

`ExternalSessionStore` is a provider-neutral sibling persistence port using the same expected-version/copy-on-write transaction discipline as the synthetic `WorkflowStore`. It atomically covers challenge attempt advancement, challenge consume + session creation, single-session replacement, session updates, and reissue invalidation without embedding provider transaction syntax into domain/application code.
""",
    "docs/security/AUTHORIZATION.md": """

## Release 0.13 provider-neutral bootstrap/session core authorization

Release 0.13 implements delivery state but does not make it product authority. `bootstrapId`, `BootstrapFormGuard`, bootstrap proof, `BrowserSession`, and AccessGrant remain distinct. The stateless form guard authenticates only challenge/generation/origin/nonce/expiry request-integrity claims; issuing it does not mutate challenge state and possessing it cannot exercise `THREAD_READ`, `ATTACHMENT_READ`, or `THREAD_REPLY`.

Successful bootstrap returns a fresh session credential and stores only its verifier. Presenting that credential updates authoritative session activity and returns an application-owned `ValidatedBrowserSessionBinding` that cannot be constructed with caller-selected grant authority. The session-backed access service rechecks the current session record/version, current AccessGrant deployment/thread binding, explicit requested operation, revocation, server-time expiry, and current thread lifecycle before any protected action.

The existing raw AccessGrant bearer path remains available to the disabled Release 0.9–0.11 synthetic browser adapter. Session-backed reply separately retains expected thread version plus the existing `AccessGrantAuthorityGuard`; session-backed attachment retrieval calls the existing authoritative `retrieveAuthorizedAttachment()` path and therefore retains exactly-`CLEAN`, ownership, integrity, and post-success download-evidence semantics.

Logout invalidates only the server-side browser session. Reissue atomically invalidates outstanding bootstrap challenges and active browser sessions for that AccessGrant before publishing a fresh challenge. Neither action silently revokes or widens the AccessGrant itself.
""",
    "docs/security/TEST_AND_SECURITY_STRATEGY.md": """

## Release 0.13 executable bootstrap/session regression boundary

Release 0.13 turns the Release 0.12 architecture invariants into deterministic domain/application tests. Coverage includes high-entropy bootstrap IDs; raw proof one-time return and non-persistence; keyed proof verifier behavior; form-guard challenge/generation/origin/nonce/expiry binding; guard issuance without challenge mutation; exact challenge expiry; failed-attempt count/generation advancement; stale-guard rejection; exact five-attempt lock; copy-on-write rollback; same-generation replay races; concurrent valid consume races; fresh 256-bit session bearer/verifier separation; wrong-bearer denial; exact idle and absolute expiry; activity without absolute sliding; one active session; logout; reissue invalidation; and absence of bootstrap/session credentials from workflow evidence.

Session-backed authorization tests prove that `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` remain independent; a caller cannot manufacture the application-owned validated-session binding; current AccessGrant revocation/expiry and lifecycle changes win over browser delivery state; reissue stales existing bindings; the existing raw bearer path still works; reply actor/activity/audit semantics remain unchanged; and the existing attachment/reply/concurrency regression suites remain part of the complete gate.

Release 0.13 adds no HTTP/browser bootstrap surface, so no new Playwright route is manufactured. The existing desktop/mobile/axe suite remains mandatory regression coverage and the full protected-main `npm run validate` gate remains required.
""",
    "docs/security/THREAT_MODEL.md": """

## Release 0.13 bootstrap/session core implementation threats

Release 0.13 implements the provider-neutral delivery-state core while leaving public transport deferred. The lower-entropy one-time proof is protected with an HMAC-SHA-256 verifier whose injected key is separate from ordinary state; state-store disclosure alone therefore does not provide the material needed to validate offline guesses. The raw proof, `BootstrapFormGuard`, raw browser bearer, session verifier, and proof-verifier key are excluded from workflow audit and application outputs except the one-time proof/bearer issuance results required by trusted application composition.

Replay and concurrency are bounded by authoritative challenge generation plus optimistic version. Every proof attempt that reaches challenge processing either advances generation/version or consumes the challenge. The in-memory transaction publishes consumed challenge + new session together or neither, invalidates an earlier active session before publishing a replacement, and makes reissue invalidation + replacement challenge atomic within delivery state.

A browser session remains a replayable delivery credential until idle/absolute expiry or invalidation, so theft is bounded rather than eliminated. Its 256-bit bearer is never persisted, and session presentation returns an application-owned binding whose current record/version is rechecked before AccessGrant authorization. Current grant revocation, expiry, lifecycle/resource checks, operation independence, reply `AccessGrantAuthorityGuard`, and attachment safety remain authoritative even when session delivery state is otherwise valid.

Because Release 0.13 has no public HTTP/bootstrap UI/cookie or production adapter, it does not yet provide production CSRF, abuse-rate, notification, edge, recovery, or deployment evidence. Those remain later release/deployment gates under ADR-0005.
""",
}
for filename, addition in additions.items():
    path = Path(filename)
    current = path.read_text()
    heading = addition.strip().splitlines()[0]
    if heading not in current:
        path.write_text(current + addition)

Path("docs/releases/0.13-bootstrap-session-core.md").write_text(
    """# Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype

## Purpose

Release 0.13 implements the synthetic/local provider-neutral delivery-state core specified by accepted ADR-0005. It does not expose that core through a real/public browser route.

## Authoritative base

- Release 0.12 squash merge: `ef81e7563176197c375e03e1ebc86dc4a055d6bd`
- Release 0.12 accepted tree: `bb1c5717e40059b07796c4402dadcd2178a0bc2a`

## Implemented core

- `BootstrapChallenge` with deployment/thread/AccessGrant binding, HMAC verifier metadata, verification mode, issued/expiry time, failed-attempt count, five-attempt maximum, consume/invalidation state, authoritative generation, and optimistic version.
- Cryptographically random bootstrap proof with 64 bits of entropy, returned only at issuance and persisted only as `hmac-sha256:v1` using injected synthetic key material.
- `BootstrapFormGuard` as stateless HMAC-authenticated pre-session request-integrity material bound to bootstrap ID, challenge generation, exact origin, fresh 128-bit nonce, issued time, and expiry bounded to 10 minutes and challenge expiry.
- Copy-on-write `ExternalSessionStore` atomic mutations for challenge creation/update, consume + browser-session creation, session update/replacement, and reissue invalidation.
- `BrowserSession` with fresh 256-bit bearer returned only at establishment, persisted `sha256:v1` verifier only, 20-minute absolute / 10-minute idle limits, server-side activity/invalidation, one active session per AccessGrant, logout, and reissue invalidation.
- Runtime-protected `ValidatedBrowserSessionBinding` created only after current session bearer/state validation.
- Parallel `SessionBackedExternalAccessService` that reloads current session, AccessGrant, and thread for every requested operation and preserves explicit `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` independence.
- Session-backed reply preserves authoritative external actor attribution, expected thread version, and the existing Release 0.10 `AccessGrantAuthorityGuard`.
- Session-backed attachment handling reuses `retrieveAuthorizedAttachment()` and therefore preserves authoritative ownership, exactly-`CLEAN` safety, protected-content integrity, and download evidence only after successful retrieval.
- Existing raw AccessGrant bearer service and disabled Release 0.9–0.11 synthetic browser adapter remain unchanged.

## Evidence and secret boundary

No bootstrap/session action creates `THREAD_OPENED`, `ATTACHMENT_DOWNLOADED`, TransferAttestation, completion, or lifecycle transitions. Release 0.13 adds no workflow security-event overload. Raw bootstrap proof, proof-verifier key, form guard, raw session bearer, session verifier, raw AccessGrant bearer, message body, and attachment bytes are not written into workflow audit by this core.

## Deferred

No public bootstrap/session HTTP route, recipient UI, cookie issuance, production CSRF/session transport, notification/email/SMS/voice provider, public abuse service, DynamoDB/S3/KMS/Lambda/API Gateway/AWS SDK, Cloudflare production resource, IaC, customer data/PHI, analytics, paid service, or production-readiness/compliance claim is introduced.

Dependency additions/removals: **none**.

Expected recurring cost introduced by Release 0.13: **$0**.
"""
)
