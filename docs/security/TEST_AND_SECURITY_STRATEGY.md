# Test and Security Strategy

Release 0.1 contains no executable product code. This document defines the validation baseline expected as implementation begins.

## Release 0.1 documentation validation

Before merge, validate:

- authoritative documents do not conflict;
- product scope and non-goals are consistent;
- architecture and data-flow trust boundaries agree;
- authorization rules agree with queue/search/index behavior;
- lifecycle states agree with retention/disposition semantics;
- state-store access patterns cover queue, thread, message, attachment, lifecycle, audit, retention, search/filter, transaction, and reporting needs;
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
- disposition orchestration.

### Browser tests

Use representative responsive widths and keyboard-only flows.

Cover:

- public submission;
- staff queue;
- thread view;
- reply;
- attachment state;
- lifecycle actions;
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
- token/grant replay behavior;
- malicious/unknown upload status;
- MIME/extension mismatch;
- oversized upload;
- unsafe filename rendering;
- object retrieval without app authorization;
- retention candidate that is no longer eligible;
- enumeration/error-message leakage;
- notification content leakage.

### Tenant/deployment isolation

Even though the reference production model is isolated per customer, synthetic tests use at least two deployment contexts and verify that identifiers cannot cross boundaries.

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
