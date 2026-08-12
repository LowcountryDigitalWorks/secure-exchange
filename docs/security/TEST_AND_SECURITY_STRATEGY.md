# Test and Security Strategy

Release 0.1 contains no executable product code. This document defines the validation baseline expected as implementation begins.

## Release 0.1 documentation validation

Before merge, validate:

- authoritative documents do not conflict;
- product scope and non-goals are consistent;
- architecture and data-flow trust boundaries agree;
- authorization rules agree with queue/search/index behavior;
- lifecycle states agree with retention/disposition semantics;
- opened/read, download, TransferAttestation, and completion evidence remain explicitly distinct and are not inferred from one another;
- configured completion policy can require authoritative TransferAttestation evidence and fails closed when qualifying evidence is absent;
- state-store access patterns cover queue, thread, message, attachment, lifecycle, audit, workflow evidence/TransferAttestation, retention, search/filter, transaction, and reporting needs;
- provider dependencies have purpose, data exposure, security/privacy, cost characteristic, lock-in, and replacement path;
- deferred capabilities are marked deferred;
- no compliance claim is made;
- no secrets, production credentials, customer data, or PHI are present;
- Markdown links resolve.

## Engineering baseline expected next

### Static quality

- formatting;
- linting;
- strict TypeScript checking;
- build validation.

### Unit tests

Prioritize deterministic domain behavior:

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

### Integration tests

Use synthetic adapters/fixtures to test:

- transaction boundaries;
- repository contracts;
- object lifecycle;
- notification minimization;
- malware state transitions;
- distinct opened/read and download evidence persistence;
- TransferAttestation persistence/retrieval and related audit evidence;
- atomic/conditional completion with configured attestation requirements;
- disposition orchestration.

### Browser tests

Use representative responsive widths and keyboard-only flows.

Cover:

- public submission;
- staff queue;
- thread view;
- visible opened/read, download, transfer/filing, and completion facts without conflating them;
- transfer/filing attestation action where authorized;
- reply;
- attachment state;
- lifecycle actions;
- completion denied when a configured attestation prerequisite is unmet;
- error/empty states.

### Accessibility

Automate axe-core checks and include manual keyboard/focus/semantic review for critical flows.

### Security/negative tests

Required categories:

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

### Tenant/deployment isolation

Even though the reference production model is isolated per customer, synthetic tests use at least two deployment contexts and verify that identifiers and TransferAttestation evidence cannot cross boundaries.

### Secret and dependency checks

Expected CI:

- secret detection;
- dependency vulnerability review;
- lockfile integrity;
- minimal permissions.

## No test weakening

A failing security or authorization test is fixed in implementation or design. Tests are not removed or weakened merely to obtain a green build.

## Production validation

Regulated production requires additional deployment-specific evidence for IAM, network/exposure, identity/MFA, encryption, logging, backups, retention, malware scanning, incident response, and contractual coverage.
