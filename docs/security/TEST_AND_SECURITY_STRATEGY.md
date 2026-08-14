# Test and Security Strategy

Release 0.4 extends the Release 0.2 validation baseline and Release 0.3 workflow-core regression coverage with deterministic provider-neutral conversation/queue tests. It remains a synthetic/local prototype and provides no production security/compliance evidence.

## Complete validation gate

```sh
npm run validate
```

It fails on applicable:

- formatting drift;
- ESLint/type-aware lint errors;
- strict TypeScript errors;
- Vitest unit/integration/architecture failures;
- production build failures;
- Playwright browser/responsive failures;
- axe-core WCAG A/AA violations detected by the baseline pages;
- high-or-critical `npm audit` findings;
- Secretlint findings.

The GitHub Actions workflow runs the same command with least-privileged repository permissions. Protected `main` requires the `validate` check.

## Architecture-boundary regression coverage

Architecture tests protect the Release 0.1 layering decision. The `domain` and `application` layers must not acquire Hono, AWS SDK, Node provider API, browser-runtime dependencies, or backwards dependencies on adapters/HTTP/web presentation.

These tests should become more specific as features are introduced rather than being removed to accommodate coupling.

## Release 0.3 regression coverage

Release 0.4 retains deterministic coverage for:

- every lifecycle transition in the Release 0.3 matrix;
- invalid/stale transitions and terminal `DISPOSED`;
- completion/disposition timestamp semantics;
- completion policy with or without required TransferAttestation;
- failed/wrong-scope/unauthorized/superseded/invalidated evidence rejection;
- authoritative deployment, queue, actor, and action permission checks;
- Opened distinct from Downloaded;
- Downloaded not creating TransferAttestation;
- TransferAttestation not completing a thread;
- all-or-nothing workflow mutation + audit rollback.

## Release 0.4 unit coverage

Deterministic domain tests cover:

- bounded plain-text message creation and line-ending normalization;
- rejection of empty, oversized, or unsafe control-character message input;
- bounded queue/configuration normalization;
- invalid/duplicate routing configuration rejection;
- thread activity/version advancement without lifecycle or unread inference.

## Release 0.4 integration coverage

Synthetic application/in-memory-adapter tests cover:

- valid accountless external initiation;
- inactive/unsupported/cross-deployment routing rejection;
- atomic thread + initial message + audit creation;
- initiation rollback on synthetic transaction failure;
- chronological message reads;
- queue candidate scope and content minimization;
- candidate membership not granting authoritative thread access;
- authorized staff conversation read;
- unauthorized queue/thread and cross-deployment denial;
- Opened remaining distinct from Downloaded/TransferAttestation/completion;
- explicit staff reply permission and STAFF actor requirement;
- atomic reply + thread activity/version + audit commit;
- reply rollback on transaction failure;
- message bodies excluded from audit evidence;
- staff reply not implying completion, download, or TransferAttestation;
- stale reply/version failure before mutation;
- attention metadata preserved without inventing per-user unread state.

## Message-content safety

Release 0.4 messages use bounded plain text for synthetic/local development only.

Message bodies:

- are never copied into AuditEvent records;
- are never included in queue candidate rows;
- are loaded only after authoritative conversation authorization;
- are not used as identifiers;
- are bounded and reject unsafe control-character forms;
- are not logged by the application services.

The Release 0.4 representation is not a production storage/encryption contract.

## Queue candidate versus authority

Queue/list results are convenience candidate views. They can never satisfy authorization for content retrieval or mutation. Staff conversation operations reload the authoritative deployment/thread and validate current active actor, actor kind, queue scope, and explicit action permission before message content is loaded.

## Workflow evidence rules

The following facts remain distinct:

**Opened != Downloaded != Transferred/Filed != Completed.**

- opening a conversation appends an Opened audit event only;
- successful download evidence remains a separate audit event;
- TransferAttestation is explicit authenticated staff business evidence;
- TransferAttestation does not itself change lifecycle state;
- completion is a separate authorized lifecycle operation subject to current policy and authoritative evidence validation;
- appending a message does not imply any of those facts.

## Unread/read-position boundary

Release 0.4 does not create per-user unread/read-position state. Lifecycle `NEW`, `THREAD_OPENED`, `lastActivityAt`, and `attentionAt` are not treated as equivalent unread signals. If later UX needs per-user unread counts, a durable read-position/read-receipt model must be designed and tested explicitly.

## Attachment/download-evidence boundary

Release 0.4 still has no attachment retrieval path. Future production `ATTACHMENT_DOWNLOADED` evidence must be emitted only after the authoritative successful retrieval path validates deployment/thread ownership, attachment ownership, current actor/access authority, retrievable lifecycle state, and a release-eligible malware state such as `CLEAN`. The standalone synthetic evidence method must not become a public/browser action.

## Browser and accessibility tests

Playwright continues to run Chromium at representative desktop and mobile viewport sizes and runs `@axe-core/playwright` against WCAG A/AA tags.

Release 0.4 adds no business UI or public endpoint, so browser coverage remains on the non-sensitive development shell and `/health`. Future user-visible conversation/submission workflows must add browser coverage when introduced.

## Secret and dependency checks

Release 0.4 adds no dependency. Existing controls remain:

- Secretlint with its recommended preset;
- `npm audit --audit-level=high`;
- committed `package-lock.json` with `npm ci` in CI;
- strict reviewed install-script allowlist;
- GitHub Actions `contents: read` permissions for normal validation.

These automated controls supplement, rather than replace, the rule that secrets and regulated/customer data must never be committed.

## No test weakening

A failing security, architecture, authorization, accessibility, or quality test is fixed in implementation or design. Tests are not removed or weakened merely to obtain a green build.

## Production validation

Regulated production requires additional deployment-specific evidence for IAM, network/exposure, identity/MFA, encryption, logging, backups, retention, malware scanning, abuse controls, incident response, and contractual coverage. Release 0.4 provides none of that production evidence and makes no compliance-ready claim.

## Release 0.5 local development vertical-slice coverage

Release 0.5 extends the executable gate with deterministic domain/application/HTTP/browser tests for:

- reply eligibility across all seven lifecycle states and no-partial-mutation rejection;
- default-disabled and explicitly enabled demo composition;
- minimal external form and server-generated authoritative IDs;
- browser inability to choose actor/deployment/queue authority or authoritative thread/message/audit IDs;
- invalid/inactive routing and POST/Redirect/GET behavior;
- no GET mutation;
- metadata-only queue output;
- explicit Opened evidence versus non-mutating authorized reads;
- chronological direction-labeled message rendering;
- expected-version staff reply and stale rejection;
- server-side HTML escaping of script/markup-shaped synthetic content;
- audit-body exclusion;
- no-store caching and restrictive CSP;
- same-origin Fetch Metadata/Origin mutation boundaries;
- desktop/mobile Chromium vertical-slice flow and axe WCAG A/AA checks;
- all existing Release 0.2-0.4 architecture, workflow, completion, evidence, queue, message, and authorization regression tests.

The functional demo remains synthetic/local only. These tests are not production authentication, infrastructure, HIPAA, or regulated-deployment evidence.

## Release 0.6 attachment-safety coverage

Release 0.6 adds deterministic domain/application coverage for attachment policy, filename normalization, safety state, normalized scan results, protected-content storage, authorization/isolation, download evidence, and compensation boundaries.

New unit coverage verifies bounded valid metadata, size/type/extension rejection, path/control-shaped filenames, invalid policy configuration, clean/malicious/indeterminate scan behavior, replay behavior, invalid current-state transitions, and retrieval eligibility across all non-clean states.

New integration coverage verifies QUARANTINED publication, per-message count enforcement, protected-content write failure, metadata-commit compensation, successful clean scan/retrieval, malicious/indeterminate handling, scan replay and rollback, cross-deployment scan rejection, cross-deployment/wrong-thread/wrong-message retrieval denial, missing queue scope/permission denial, missing/failed content behavior, DELETED fail-closed behavior, exact successful-download audit creation, no TransferAttestation/completion/thread mutation from download, and absence of content/unrestricted filename values from audit.

Every Release 0.2-0.5 regression remains part of `npm run validate`, including desktop/mobile Playwright and accessibility coverage for the existing synthetic browser demo. Release 0.6 deliberately adds no attachment browser route, so no new attachment-specific browser test is required.

## Release 0.7 AccessGrant and concurrency coverage

Release 0.7 adds deterministic tests for Web Crypto secret issuance and verifier matching; raw-secret non-persistence; verifier non-exposure; wrong secret, deployment, thread, and operation denial; bounded lifetime; server-time expiry at the exact boundary; issue permission and terminal-thread denial; retained-record revocation and idempotent replay; current thread-state revalidation; conservative external denial; explicit external conversation projection minimization; and preservation of lifecycle/TransferAttestation independence.

The external projection regression verifies that queue ID, routing category, staff/external actor references, and audit metadata are absent. Grant issuance/revocation/retrieval audit serialization is checked to exclude raw secret and verifier material.

Release 0.7 also adds a deterministic two-writer barrier test for `maxAttachmentsPerMessage`. Both ingestion attempts pass the earlier application pre-check and stage content, but only one can publish when the authoritative limit is one; the losing staged content is compensated. Additional tests reject a stale attachment-policy reference and reject direct attachment publication that omits the authoritative count guard.

Every Release 0.2-0.6 regression remains in `npm run validate`. No new browser retrieval test exists because Release 0.7 intentionally adds no public external retrieval route.

## Release 0.8 regression requirements

Executable coverage must prove `THREAD_READ` and `ATTACHMENT_READ` independence, policy rejection when attachment-read is disallowed, wrong-secret/revoked/expired/deployment/thread denial, message and attachment ownership isolation, denial of `PENDING_UPLOAD`, `QUARANTINED`, `REJECTED`, and `DELETED`, exactly-`CLEAN` success, missing/read-failed/inconsistent protected content denial, and no download evidence for any failed retrieval.

Successful external retrieval must emit minimized `ATTACHMENT_DOWNLOADED` evidence only after integrity validation, with no bearer secret, verifier, content reference, or bytes in audit. Tests also preserve staff retrieval, Release 0.7 AccessGrant behavior, the concurrent attachment-count invariant, and the evidence separation `Opened != Downloaded != Transferred/Filed != Completed`.

Release 0.8 adds no browser surface; existing Playwright/axe coverage remains regression coverage for the development shell rather than evidence of a public external endpoint.

## Release 0.9 browser-delivery regression requirements

Automated coverage verifies the external routes are disabled by default; credential establishment is same-origin POST; secrets do not enter Location headers, generated URLs, or rendered post-establishment pages; capability cookies are HttpOnly, Strict, narrowly path-scoped, host-only, short-lived, and Secure on HTTPS; explicit operation independence is preserved; conversation text is escaped; clean candidate metadata is bounded; download uses safe headers and the Release 0.8 application service; cross-origin POSTs fail; revoked/expired grants fail after cookie establishment; end-access clears only browser state; and failed unsafe/content retrieval produces no download evidence.

All existing attachment-state, protected-content integrity, TransferAttestation/completion separation, AccessGrant, workflow, browser, accessibility, audit, dependency, and secret-scanning regressions remain part of `npm run validate`.

## Release 0.10 external reply regression requirements

Deterministic unit coverage proves the explicit reply lifecycle matrix and external activity/attention version semantics. Integration coverage proves `THREAD_REPLY` is independent from read/attachment authority; reply-only and mixed grants; policy rejection; wrong-secret/revoked/expired/wrong-scope denial; grant-ID-without-secret denial; authoritative grant actor attribution; all four allowed and all three denied lifecycle states; active-grant denial after completion; bounded plain-text validation; immutable chronological external messages; minimized audit; no lifecycle/download/open/TransferAttestation/completion inference; transaction rollback; and stale concurrent expected-version failure without partial publication.

Existing staff-reply behavior and all Release 0.7–0.9 AccessGrant, attachment, browser, accessibility, secret, dependency, workflow, and evidence regressions remain part of `npm run validate`. Release 0.10 deliberately adds no browser reply surface, so the existing browser suite remains regression coverage rather than a reply-delivery test.

## Release 0.11 browser reply regression boundary

Release 0.11 adds deterministic HTTP/browser checks for operation independence, disabled-by-default routing, same-origin reply POST, safe fixed PRG navigation, bounded plain-text validation, authoritative actor attribution, revocation/expiry/lifecycle denial, activity/attention semantics, audit minimization, and accessibility. Release 0.10 stale-thread, concurrent-revocation, and expiry-crossing tests remain intact and continue to prove the transaction boundary below HTTP.

## Release 0.12 architecture/security validation boundary

Release 0.12 is documentation/architecture only. It intentionally does **not** add production bootstrap/session runtime code or manufacture runtime tests for code that does not exist. The complete existing `npm run validate` gate must remain green, and the release candidate must receive the normal protected-main pull-request-context `validate` check.

The new architecture creates implementation invariants that later executable releases must test before any public production exposure.

### Bootstrap invariants for future implementation

Tests must prove:

- the notification URL contains only a non-secret opaque bootstrap locator;
- raw bootstrap proof, AccessGrant bearer, session bearer, verifier, and CSRF proof never enter path/query/fragment/Location/generated links;
- GET of the bootstrap locator page cannot consume/lock a challenge, establish a session, or retrieve protected content;
- mail-security/link-prefetch GETs therefore remain non-authorizing;
- a valid proof is accepted only by protected POST with the required browser mutation signals;
- the raw proof is never persisted/logged/audited;
- the stored proof verifier is keyed/non-reversible and a state-store-only disclosure is insufficient to validate guesses offline without the separately held key;
- proof expiry is enforced at the exact authoritative time boundary;
- failed attempts increment authoritatively and the configured maximum locks/invalidates the challenge;
- successful consume plus session creation is atomic;
- concurrent/replayed submissions produce at most one new session;
- reissue invalidates every outstanding prior challenge for the grant;
- unknown/wrong/expired/consumed/locked/revoked cases collapse to bounded generic external behavior.

### Browser-session invariants for future implementation

Tests must prove:

- successful bootstrap creates a fresh random session rather than upgrading a pre-auth token;
- raw session bearer has 256 bits of random material and is never persisted;
- the state store contains only a versioned one-way verifier and bounded opaque metadata;
- database/state disclosure alone does not yield a directly usable cookie credential;
- cookie is `__Host-sx_external`, host-only/no Domain, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`;
- no localStorage/sessionStorage/IndexedDB bearer copy is created;
- 20-minute absolute and 10-minute idle reference bounds are enforced from authoritative server time;
- activity cannot silently slide the absolute expiry;
- one-active-session-per-AccessGrant behavior invalidates the prior session on establishment of a new one;
- logout revokes the server-side session before clearing the cookie;
- AccessGrant revocation/expiry/current lifecycle denial wins even when the session remains locally present;
- reissue/compromise invalidates the relevant sessions;
- a session without the explicit requested AccessGrant operation cannot exercise that operation.

### Authorization/concurrency invariants

Every production browser operation must be covered by tests demonstrating current authoritative deployment/thread/AccessGrant lookup, explicit operation independence, revocation/expiry, lifecycle/resource state, attachment ownership/safety where applicable, expected version, and `AccessGrantAuthorityGuard` for external reply mutation.

A browser session row, cookie, locator, candidate list, successful prior request, or UI-visible control never grants or widens `THREAD_READ`, `ATTACHMENT_READ`, or `THREAD_REPLY`.

The existing evidence separation remains mandatory: `Opened != Downloaded != Transferred/Filed != Completed`.

### CSRF/same-origin invariants

Mutation tests must require all applicable layers together:

- non-GET method;
- exact expected Origin;
- same-origin Fetch Metadata when present;
- valid session-bound CSRF/synchronizer proof;
- valid current session;
- current AccessGrant/application authorization.

Cross-origin/missing/wrong-CSRF cases fail closed. Tests must not treat `SameSite` alone as sufficient CSRF protection. CORS remains closed by default; CSP/form-action/frame/base-uri and no-store/no-referrer headers receive browser regression coverage.

### Abuse-control invariants

Later public-delivery tests must exercise bounded request/body/message/file size rejection, per-bootstrap attempt lockout, per-source/deployment/session/grant throttles, reissue/notification ceilings, reply/download quotas, progressive/temporary throttling behavior where implemented, and generic anti-enumeration responses.

Edge-provider controls may be tested separately as deployment evidence, but tests must prove application authorization does not depend on edge rate-limit/cache state.

### Notification and logging invariants

Automated serialization/logging tests must prevent ordinary notifications, audit, and infrastructure/application logs from containing:

- PHI/message/attachment content;
- bootstrap proof;
- raw AccessGrant or session bearer;
- stored verifier;
- cookie/CSRF secret;
- unrestricted external contact information;
- provider credentials/private keys.

Notification tests must distinguish `MAILBOX_ONLY` from `INDEPENDENT_CHALLENGE` and must not claim same-mailbox link + code is MFA. Independent-channel proof must not be copied back into notification email.

Security telemetry tests should prefer bounded opaque IDs/reason codes and prove attacker-driven invalid submissions cannot generate unrestricted sensitive or unbounded log content.

### Recovery invariants

Production adapter/recovery tests must prove that restore/failover does not resurrect consumed bootstrap challenges, expired/revoked sessions, or revoked AccessGrants. Where continuity cannot establish monotonic revocation, tests must demonstrate the deployment access/security epoch or equivalent invalidation mechanism denies pre-restore delivery authority before reissue.

### Release 0.12 evidence limitation

Passing the existing repository gate and documenting these future invariants is evidence only that the design remains internally consistent with the current codebase. It is **not** evidence of production deployment, production authentication/session behavior, anonymous-Internet abuse resistance, provider configuration, malware scanning, backup recovery, HIPAA compliance, certification, or regulated readiness.

See [External Delivery and Credential Bootstrap Boundary](../architecture/EXTERNAL_DELIVERY_BOUNDARY.md) and [ADR-0005](../adr/0005-external-bootstrap-session-boundary.md).
