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
