# Test and Security Strategy

Release 0.2 establishes the first executable validation baseline while preserving the Release 0.1 security model. It deliberately contains no Secure Exchange business workflow implementation.

## Release 0.2 executable baseline

The complete engineering gate is:

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

The GitHub Actions workflow runs the same command with least-privileged repository permissions.

## Architecture-boundary regression baseline

Release 0.2 includes an automated architecture test that protects the Release 0.1 layering decision. The `domain` and `application` layers must not acquire Hono, AWS SDK, Node provider API, or browser-runtime dependencies.

As features are introduced, these tests should become more specific rather than being removed to accommodate coupling.

## Unit tests

As business implementation begins, prioritize deterministic domain behavior:

- state transitions;
- authorization policy;
- workflow-evidence independence (`Opened != Downloaded != Transferred/Filed != Completed`);
- TransferAttestation validation/supersession semantics;
- completion-policy preconditions requiring qualifying TransferAttestation evidence where configured;
- retention due calculations;
- access-grant expiry/revocation semantics;
- configuration validation;
- file policy rules;
- audit-event derivation.

Release 0.2's unit test covers only the non-sensitive engineering-status use case.

## Integration tests

Future synthetic adapters/fixtures should test:

- transaction boundaries;
- repository contracts;
- object lifecycle;
- notification minimization;
- malware state transitions;
- distinct opened/read and download evidence persistence;
- TransferAttestation persistence/retrieval and related audit evidence;
- atomic/conditional completion with configured attestation requirements;
- disposition orchestration.

Release 0.2 integration tests cover only the in-process HTTP shell and security-header behavior; no external service is contacted.

## Browser and accessibility tests

The Release 0.2 Playwright baseline runs Chromium at representative desktop and mobile viewport sizes. It verifies the engineering shell and `/health` route and runs `@axe-core/playwright` against WCAG A/AA tags.

Feature releases must add browser coverage for the user-visible workflows they introduce. Accessibility failures are defects, not optional warnings.

## Security/negative tests required as features arrive

Required categories remain:

- unauthenticated access;
- wrong-role access;
- wrong-queue access;
- cross-deployment identifier substitution;
- stale lifecycle mutation;
- eventually consistent queue candidate followed by denied authoritative access;
- expired/revoked access grant;
- access-grant reuse behavior;
- malicious/unknown upload status;
- MIME/extension mismatch;
- oversized upload;
- unsafe filename rendering;
- object retrieval denied when application authorization is absent;
- opening/reading a thread does not create or satisfy download evidence;
- successful download does not create or satisfy TransferAttestation evidence;
- successful TransferAttestation does not itself transition a thread to `COMPLETED`;
- completion policy requiring TransferAttestation rejects a missing attestation;
- completion policy rejects failed, superseded/invalid, wrong-deployment, wrong-thread, unauthorized-actor, or otherwise non-qualifying attestation evidence;
- completion validation does not trust an eventually consistent workflow-evidence summary when authoritative attestation data is required;
- retention candidate that is no longer eligible;
- enumeration/error-message leakage;
- notification content leakage.

## Tenant/deployment isolation

When tenancy-aware business logic begins, synthetic tests use at least two deployment contexts and verify identifiers and TransferAttestation evidence cannot cross boundaries. Release 0.2 does not implement tenancy records or persistence.

## Secret and dependency checks

Release 0.2 uses:

- Secretlint with its recommended preset for repository secret detection;
- `npm audit --audit-level=high` for dependency vulnerability gating;
- committed `package-lock.json` with `npm ci` in CI;
- GitHub Actions `contents: read` permissions for normal validation.

These automated controls supplement, rather than replace, the rule that secrets and regulated/customer data must never be committed.

## No test weakening

A failing security, architecture, authorization, accessibility, or quality test is fixed in implementation or design. Tests are not removed or weakened merely to obtain a green build.

## Production validation

Regulated production requires additional deployment-specific evidence for IAM, network/exposure, identity/MFA, encryption, logging, backups, retention, malware scanning, incident response, and contractual coverage. Release 0.2 provides none of that production evidence and makes no compliance-ready claim.
