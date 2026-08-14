from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


def append_section(path: str, heading: str, body: str) -> None:
    file = Path(path)
    text = file.read_text()
    if heading not in text:
        file.write_text(text + body)


# Independent browser-session lifetime: AccessGrant expiry remains a separate
# per-operation authorization check rather than shortening delivery state.
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
replace_once(
    "src/application/external-session-service.ts",
    "  type BrowserSession,\n",
    "",
)

# Exact expected-version checks stay fail-closed while satisfying the repository
# optional-chain style rule.
replace_once(
    "src/adapters/in-memory-external-session-store.ts",
    """    if (\n      current === undefined ||\n      current.version !== update.expectedVersion ||\n      current.generation !== update.expectedGeneration\n    ) {""",
    """    if (\n      current?.version !== update.expectedVersion ||\n      current?.generation !== update.expectedGeneration\n    ) {""",
)
replace_once(
    "src/adapters/in-memory-external-session-store.ts",
    """    if (\n      current === undefined ||\n      current.version !== exchange.expectedChallengeVersion ||\n      current.generation !== exchange.expectedChallengeGeneration ||\n      !isOutstandingChallenge(current)\n    ) {""",
    """    if (\n      current?.version !== exchange.expectedChallengeVersion ||\n      current?.generation !== exchange.expectedChallengeGeneration ||\n      current?.consumedAt !== undefined ||\n      current?.invalidatedAt !== undefined\n    ) {""",
)
replace_once(
    "src/adapters/in-memory-external-session-store.ts",
    "if (current === undefined || current.version !== update.expectedVersion) {",
    "if (current?.version !== update.expectedVersion) {",
)

# Strengthen rollback coverage to inspect the same grant that was exchanged.
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

replace_once(
    "tests/helpers/external-session-fixture.ts",
    'constructor(private value: string = "2026-08-14T12:00:00.000Z") {}',
    'constructor(private value = "2026-08-14T12:00:00.000Z") {}',
)
replace_once(
    "tests/integration/session-backed-access-grant-expiry.test.ts",
    'import { describe, expect, it } from "vitest";',
    'import { expect, it } from "vitest";',
)
expiry_path = Path("tests/integration/session-backed-access-grant-expiry.test.ts")
expiry_text = expiry_path.read_text().replace(
    """  expect(storedSession).toBeDefined();\n  expect(\n    isBrowserSessionActiveAt(storedSession!, \"2026-08-14T12:15:00.000Z\"),\n  ).toBe(true);""",
    """  if (storedSession === undefined) {\n    throw new Error(\"Expected authoritative browser session.\");\n  }\n  expect(\n    isBrowserSessionActiveAt(storedSession, \"2026-08-14T12:15:00.000Z\"),\n  ).toBe(true);""",
)
expiry_path.write_text(expiry_text)

# Required correction to the short Release 0.12 roadmap summary only.
replace_once(
    "docs/MVP_AND_ROADMAP.md",
    "Production mutation design requires Origin + Fetch Metadata + session-bound CSRF proof and keeps CORS closed by default.",
    "Production mutation protection is explicitly two-phase: pre-session bootstrap uses exact Origin + same-origin Fetch Metadata when present + `BootstrapFormGuard`; established-session mutations use exact Origin + same-origin Fetch Metadata when present + a session-bound CSRF/synchronizer proof. CORS remains closed by default.",
)

append_section(
    "docs/MVP_AND_ROADMAP.md",
    "## Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype",
    """

## Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype

Release 0.13 implements the Release 0.12 delivery-state core without a public browser surface: provider-neutral `BootstrapChallenge` and `BrowserSession` models, keyed bootstrap-proof verification, stateless challenge/generation-bound `BootstrapFormGuard`, atomic challenge consume + session creation, one-active-session-per-AccessGrant replacement, logout/reissue invalidation, and authoritative idle/absolute expiry.

A validated session creates only application-owned delivery state. Session-backed `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY` still reload current AccessGrant/thread authority, retain independent operations, preserve the Release 0.10 `AccessGrantAuthorityGuard` for reply, and reuse the Release 0.6/0.8 exactly-`CLEAN` attachment path. The existing raw AccessGrant synthetic development path remains unchanged.

No public bootstrap route/UI/cookie, notification provider, cloud resource, customer data/PHI, analytics, or paid dependency is added. Expected recurring cost remains **$0**.
""",
)
append_section(
    "docs/architecture/DOMAIN_MODEL.md",
    "## Release 0.13 bootstrap and browser-session delivery state",
    """

## Release 0.13 bootstrap and browser-session delivery state

`BootstrapChallenge` is deployment/thread/AccessGrant-bound delivery state containing an opaque locator, keyed proof-verifier metadata, verification mode, authoritative issued/expiry times, failed-attempt/max-attempt state, consumption/invalidation state, generation, and optimistic version. Raw proof is returned only at issuance and never stored; each authoritative attempt either advances generation/version or consumes the challenge.

`BrowserSession` stores an opaque session ID, deployment/thread/AccessGrant binding, SHA-256 verifier of a fresh 256-bit bearer, establishment/last-authorized-activity/absolute-expiry times, invalidation state/reason, and optimistic version. It carries no AccessGrant operation set.

`ExternalSessionStore` is a provider-neutral sibling persistence port following the existing copy-on-write/expected-version transaction discipline for challenge attempts, consume + session establishment, single-session replacement, session updates, and reissue invalidation.
""",
)
append_section(
    "docs/security/AUTHORIZATION.md",
    "## Release 0.13 provider-neutral bootstrap/session core authorization",
    """

## Release 0.13 provider-neutral bootstrap/session core authorization

`bootstrapId`, `BootstrapFormGuard`, bootstrap proof, `BrowserSession`, and AccessGrant remain distinct. The guard authenticates only challenge/generation/origin/nonce/expiry request integrity; issuing or possessing it grants no AccessGrant operation.

Successful bootstrap returns a fresh session credential and persists only its verifier. Presentation returns an application-owned `ValidatedBrowserSessionBinding`; session-backed access then rechecks the current session/version, AccessGrant deployment/thread, explicit operation, revocation, server-time expiry, and current lifecycle/resource state.

The existing raw AccessGrant bearer path remains available to the disabled Release 0.9–0.11 synthetic adapter. Session-backed reply retains expected thread version plus `AccessGrantAuthorityGuard`; session-backed attachment retrieval reuses `retrieveAuthorizedAttachment()` and its exactly-`CLEAN`, ownership, integrity, and post-success evidence rules. Logout invalidates only the session; reissue invalidates outstanding challenges and active sessions without silently revoking or widening the AccessGrant.
""",
)
append_section(
    "docs/security/TEST_AND_SECURITY_STRATEGY.md",
    "## Release 0.13 executable bootstrap/session regression boundary",
    """

## Release 0.13 executable bootstrap/session regression boundary

Deterministic coverage now exercises high-entropy locators; raw-proof non-persistence; keyed verifier behavior; form-guard challenge/generation/origin/nonce/expiry binding; guard issuance without challenge mutation; exact challenge expiry; failed-attempt/generation advancement; stale guards; five-attempt lock; rollback; replay/concurrent-consume races; fresh session bearer/verifier separation; wrong bearer; exact idle/absolute expiry; non-sliding absolute expiry; logout/reissue; and absence of credential material from workflow evidence.

Session-backed authorization coverage proves independent `THREAD_READ`, `ATTACHMENT_READ`, and `THREAD_REPLY`; unforgeable application-owned bindings; current grant revocation/expiry/lifecycle winning over session state; raw-bearer compatibility; reply guard preservation; and attachment-safety reuse. Release 0.13 adds no HTTP/bootstrap browser surface, so existing Playwright/axe coverage remains regression coverage rather than invented production-delivery evidence.
""",
)
append_section(
    "docs/security/THREAT_MODEL.md",
    "## Release 0.13 bootstrap/session core implementation threats",
    """

## Release 0.13 bootstrap/session core implementation threats

The lower-entropy one-time proof uses HMAC-SHA-256 with injected key material separate from ordinary state, so state disclosure alone does not provide the key needed for offline verifier guesses. Raw proof, `BootstrapFormGuard`, raw session bearer, session verifier, and proof-verifier key are excluded from workflow audit.

Replay/concurrency is bounded by authoritative challenge generation plus optimistic version: an accepted proof attempt advances generation/version or consumes the challenge, and copy-on-write exchange publishes consumed challenge + new session together or neither. Reissue invalidation and replacement challenge publication are atomic within delivery state.

A browser session remains delivery state, not product authority. Current AccessGrant revocation/expiry, lifecycle/resource rules, operation independence, reply `AccessGrantAuthorityGuard`, and attachment safety continue to win. Public HTTP/CSRF, abuse-rate, notification, recovery, and production deployment evidence remain deferred.
""",
)

Path("docs/releases/0.13-bootstrap-session-core.md").write_text(
    """# Release 0.13 — Provider-Neutral Bootstrap & Browser Session Core Prototype

## Purpose

Release 0.13 implements the synthetic/local provider-neutral delivery-state core specified by accepted ADR-0005. It exposes no real/public browser bootstrap route.

## Authoritative base

- Release 0.12 squash merge: `ef81e7563176197c375e03e1ebc86dc4a055d6bd`
- Release 0.12 accepted tree: `bb1c5717e40059b07796c4402dadcd2178a0bc2a`

## Core

- `BootstrapChallenge`: deployment/thread/AccessGrant binding, HMAC verifier metadata, verification mode, issued/expiry, failed attempts (maximum five), consume/invalidation, generation, optimistic version.
- 64-bit random one-time proof returned only at issuance; persisted only as `hmac-sha256:v1` using injected synthetic key material.
- Stateless HMAC-authenticated `BootstrapFormGuard` bound to bootstrap ID, generation, exact origin, fresh 128-bit nonce, and expiry no later than ten minutes or challenge expiry.
- Copy-on-write `ExternalSessionStore` atomic challenge update, consume + session creation, session replacement/update, and reissue invalidation.
- `BrowserSession`: fresh 256-bit bearer returned once, persisted `sha256:v1` verifier only, 20-minute absolute / 10-minute idle bounds, one active session per AccessGrant, logout and reissue invalidation.
- Application-owned `ValidatedBrowserSessionBinding` and parallel `SessionBackedExternalAccessService`; current session, AccessGrant, thread, explicit operation, revocation/expiry/lifecycle and resource authority are revalidated.
- Session-backed reply retains expected thread version and Release 0.10 `AccessGrantAuthorityGuard`.
- Session-backed attachment retrieval reuses `retrieveAuthorizedAttachment()` and its ownership, exactly-`CLEAN`, protected-content integrity, and successful-download evidence contract.
- Existing raw AccessGrant bearer path and disabled Release 0.9–0.11 browser adapter remain unchanged.

## Secret/evidence boundary

Bootstrap/session actions create no `THREAD_OPENED`, `ATTACHMENT_DOWNLOADED`, TransferAttestation, completion, or lifecycle transition. Raw bootstrap proof, proof-verifier key, guard, raw session bearer, session verifier, raw AccessGrant bearer, message body, and attachment bytes are not written to workflow audit by this core.

## Deferred

No public HTTP bootstrap/session route, recipient UI, cookie issuance, production CSRF/session transport, email/SMS/voice/notification provider, public abuse service, DynamoDB/S3/KMS/Lambda/API Gateway/AWS SDK, Cloudflare production resource, IaC, customer data/PHI, analytics, paid service, or production/compliance claim.

Package version: **0.13.0**.

Dependency additions/removals: **none**.

Expected recurring cost: **$0**.
"""
)
