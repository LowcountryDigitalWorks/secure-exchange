# Test and Security Strategy

Release 0.3 extends the Release 0.2 executable validation baseline with deterministic provider-neutral workflow-core tests. It remains a synthetic/local prototype and provides no production security/compliance evidence.

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

## Release 0.3 unit coverage

Deterministic domain tests cover:

- every lifecycle transition implemented by the Release 0.3 matrix;
- representative forbidden lifecycle transitions;
- stale expected-version rejection;
- terminal `DISPOSED` behavior;
- completion/disposition timestamp semantics;
- completion policy with and without required transfer/file evidence;
- failed attestation rejection;
- wrong-thread and wrong-deployment attestation rejection;
- current-policy reference and destination-category validation;
- unauthorized historical attestation actor rejection;
- explicit superseded/invalidated evidence rejection;
- fail-closed invalid required-attestation configuration.

## Release 0.3 integration coverage

Synthetic application/in-memory-adapter tests cover:

- authoritative deployment ownership;
- authoritative queue scope;
- explicit action permission;
- Opened evidence remaining distinct from Downloaded evidence;
- Downloaded evidence not creating TransferAttestation;
- TransferAttestation not completing a thread;
- required-attestation completion success;
- missing, failed, superseded, invalidated, wrong-thread, wrong-deployment, and unauthorized-actor completion failures;
- generic transition being unable to bypass the completion-policy service;
- stale lifecycle mutation rejection;
- all-or-nothing thread mutation + audit rollback on synthetic transaction failure;
- isolation between two synthetic deployment contexts.

The local store's fault injection and map/array representation are test infrastructure only and are not production persistence contracts.

## Workflow evidence rules

The following facts are always distinct:

**Opened != Downloaded != Transferred/Filed != Completed.**

- opening a thread appends an Opened audit event only;
- successful download evidence is a separate audit event;
- TransferAttestation is explicit authenticated staff business evidence;
- TransferAttestation does not itself change lifecycle state;
- completion is a separate authorized lifecycle operation subject to current policy and authoritative evidence validation.

## TransferAttestation security properties

Release 0.3 TransferAttestation records contain only bounded structured fields: opaque identifiers, authenticated staff actor reference, timestamp, outcome, destination category, and completion-policy reference.

They do not support free-form notes and must not contain message bodies, document contents, PHI/customer details, raw downstream record identifiers, credentials, access secrets, or unrestricted metadata.

Corrections append explicit supersede/invalidate control records. Prior attestation records are not silently rewritten.

## Authorization behavior

Authentication is not implemented in Release 0.3. Tests use normalized synthetic actor contexts plus authoritative synthetic authorization records.

Application services fail closed unless all applicable checks succeed:

- actor deployment matches requested deployment;
- authoritative thread exists in that deployment;
- actor remains active;
- normalized actor class matches authoritative actor record;
- thread queue is within actor scope;
- requested action permission is granted.

For completion evidence, the historical attestation actor must also be authoritatively recognized as active staff with queue scope and transfer-attestation permission. Identifier possession or an in-memory list result never grants access.

## Browser and accessibility tests

Playwright continues to run Chromium at representative desktop and mobile viewport sizes and runs `@axe-core/playwright` against WCAG A/AA tags.

Release 0.3 adds no business UI, so browser coverage remains on the non-sensitive development shell and `/health` endpoint. Future user-visible workflows must add browser coverage when introduced.

## Secret and dependency checks

Release 0.3 adds no dependency. The Release 0.2 controls remain:

- Secretlint with its recommended preset;
- `npm audit --audit-level=high`;
- committed `package-lock.json` with `npm ci` in CI;
- strict reviewed install-script allowlist;
- GitHub Actions `contents: read` permissions for normal validation.

These automated controls supplement, rather than replace, the rule that secrets and regulated/customer data must never be committed.

## No test weakening

A failing security, architecture, authorization, accessibility, or quality test is fixed in implementation or design. Tests are not removed or weakened merely to obtain a green build.

## Production validation

Regulated production requires additional deployment-specific evidence for IAM, network/exposure, identity/MFA, encryption, logging, backups, retention, malware scanning, incident response, and contractual coverage. Release 0.3 provides none of that production evidence and makes no compliance-ready claim.
