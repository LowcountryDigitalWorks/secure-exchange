import { readFileSync, writeFileSync } from "node:fs";

function appendOnce(path, marker, section) {
  const current = readFileSync(path, "utf8");
  if (!current.includes(marker)) {
    writeFileSync(path, `${current.trimEnd()}\n\n${section.trim()}\n`);
  }
}

appendOnce(
  "docs/architecture/DOMAIN_MODEL.md",
  "## Release 0.7 implemented AccessGrant model",
  `## Release 0.7 implemented AccessGrant model

Release 0.7 makes the approved \`AccessGrant\` concept executable as temporary, provider-neutral external authority. An authoritative grant records an opaque grant ID, deployment/thread scope, one opaque external-participant actor reference, the access-policy reference used at issuance, a persisted one-way verifier digest, explicit permitted operations, issue/expiry timestamps, optional revocation timestamp, and optimistic version.

The Release 0.7 operation vocabulary contains only \`THREAD_READ\`, because external attachment retrieval and external reply are not implemented in this release. A vague unrestricted access operation is not used.

The browser/email-facing bearer secret and the stored grant record are deliberately different artifacts. The raw high-entropy secret is generated server-side and returned only at issuance. Only a versioned SHA-256 verifier of that random secret is persisted. The grant ID is neither the bearer secret nor a substitute for it. The opaque external-participant reference is actor attribution derived from authoritative thread messages; it is not client-supplied identity proof.

A grant remains separate from thread lifecycle. Current external access is allowed for \`NEW\`, \`IN_PROGRESS\`, \`AWAITING_EXTERNAL\`, \`AWAITING_STAFF\`, and \`COMPLETED\`, subject to all other grant checks. \`EXPIRED\` and \`DISPOSED\` fail closed. Grant use, expiry, or revocation does not itself transition or complete a thread.`
);

appendOnce(
  "docs/architecture/DATA_FLOW.md",
  "## Release 0.7 AccessGrant issuance and external-read flow",
  `## Release 0.7 AccessGrant issuance and external-read flow

Release 0.7 adds application-only external authority; it does not add a public retrieval route or email-link delivery.

**Issuance:** an authorized STAFF or ADMIN actor with current queue scope and \`ACCESS_GRANT_ISSUE\` requests bounded \`THREAD_READ\` authority for an authoritative thread. The application loads current grant policy, verifies current thread eligibility, derives the single opaque external-participant reference from authoritative external messages, obtains server time, generates a 256-bit random bearer secret and one-way verifier, and atomically stores only the grant/verifier plus minimized \`ACCESS_GRANT_ISSUED\` evidence. The raw secret is returned only in the issuance result.

**Validation and retrieval:** a caller must present deployment, thread, grant ID, raw secret, and the requested operation. The application loads the authoritative grant, verifies the secret against the stored verifier, checks revocation and server-time expiry, confirms the explicit operation, reloads the authoritative thread and current eligible lifecycle state, then returns only the external conversation projection. Grant ID, thread ID, queue candidates, or previously valid state never substitute for bearer-secret proof. Successful retrieval appends minimized \`EXTERNAL_THREAD_RETRIEVED\` evidence without the raw secret or verifier.

**Revocation:** an authorized \`ACCESS_GRANT_REVOKE\` action updates the retained grant record with optimistic version protection and \`revokedAt\`; exact replay is idempotent and does not duplicate revocation evidence. Revocation immediately causes later validation to fail.

The external projection contains only thread ID plus chronological message direction, creation time, and bounded message body. It excludes queue/routing data, lifecycle/admin metadata, message IDs, actor references, audit events, permissions, and grant verifier material.

External attachment retrieval remains deferred so a later release can reuse the Release 0.6 authoritative clean-attachment/content/download-evidence path rather than create a parallel implementation. External reply is also deferred because no approved external-reply lifecycle eligibility rule exists yet.

Release 0.7 also closes the Release 0.6 attachment-count race: attachment publication carries a message-scoped current-policy guard into the authoritative metadata transaction. The transaction rechecks the current policy and post-mutation count, and a losing concurrent staged object is compensated through the provider-neutral protected-content delete operation.`
);

appendOnce(
  "docs/architecture/ACCESS_PATTERNS.md",
  "## Release 0.7 AccessGrant and attachment-count access patterns",
  `## Release 0.7 AccessGrant and attachment-count access patterns

Release 0.7 adds executable access patterns to issue one thread-scoped AccessGrant using current authoritative staff/admin authorization, current thread state, current AccessGrant policy, and expected thread version; resolve one grant by deployment plus opaque grant ID for bearer-verifier validation; revalidate deployment/thread scope, explicit operation, revocation, server-time expiry, and current thread eligibility before external content is loaded; retain/version a grant for explicit revocation; and append minimized grant evidence without persisting the raw secret or exposing the verifier.

New attachment publication also requires an authoritative message-scoped guard carrying the current attachment-policy reference. The transaction validates the current policy and post-mutation per-message count before publication.

A grant ID, queue/index projection, or cached state is never authorization truth. The in-memory maps are development adapters only and do not select DynamoDB keys or indexes. Future provider implementations must preserve verifier checks, current-state revalidation, optimistic mutation semantics, and the authoritative attachment-count guard.`
);

appendOnce(
  "docs/security/AUTHORIZATION.md",
  "## Release 0.7 AccessGrant authorization boundary",
  `## Release 0.7 AccessGrant authorization boundary

Release 0.7 introduces \`ACCESS_GRANT_ISSUE\` and \`ACCESS_GRANT_REVOKE\` as explicit staff/admin permissions. Issuance and revocation still require current deployment ownership, authoritative thread lookup, live actor authorization, and current queue scope.

External authority does not reuse staff queue permissions. A valid AccessGrant is thread-scoped authority proven by possession of the high-entropy raw secret plus authoritative grant validation. Grant ID, thread ID, external-participant reference, queue membership, cached summaries, or knowledge of another resource identifier are insufficient.

The raw grant secret is generated by the application and returned once at issuance. It is never persisted. Only a versioned SHA-256 verifier is stored. The verifier is not returned by the public validation result, audit records, queue projections, or external conversation projection. The opaque external-participant reference is retained for attribution only; it is not the bearer credential.

Validation fails closed for unknown or wrong-scope grants, wrong secret, absent operation, revocation, server-time expiry, or a currently ineligible thread. Externally observable failures collapse to a conservative access-denied result.

Release 0.7 implements only \`THREAD_READ\`. External attachment authorization and external reply authority are deliberately deferred. A later attachment path must reuse the Release 0.6 \`CLEAN\` attachment and protected-content/download-evidence invariants rather than relying on a grant alone.`
);

appendOnce(
  "docs/security/THREAT_MODEL.md",
  "## Release 0.7 bearer-grant threat controls",
  `## Release 0.7 bearer-grant threat controls

Release 0.7 treats the future external bearer secret as a credential. It uses 256 bits of Web Crypto random material, returns the raw secret only at issuance, and persists only a versioned SHA-256 verifier. Password hashing is intentionally not used for this high-entropy random bearer value; guessing resistance comes from random entropy while the non-reversible verifier avoids storing the credential itself.

Threats include guessed/leaked grant IDs, stolen bearer secrets, replay after revocation, stale authorization after thread-state change, clock manipulation, verifier disclosure, and cross-deployment scope confusion. Controls include secret proof in addition to grant ID, authoritative deployment/thread lookup, explicit operation checks, current thread-state revalidation, server-controlled injectable time, bounded expiry, optimistic retained-record revocation, conservative external errors, and audit minimization.

Grant audit records contain the opaque grant ID and actor attribution where needed but never the raw secret or verifier. No bearer token is placed in a URL, repository fixture, documentation example, or browser route in Release 0.7 because public delivery is not yet implemented.

The attachment-count race is also addressed as a storage-exhaustion/data-policy correctness control: concurrent ingestion can no longer rely solely on a stale application count. The authoritative metadata transaction checks current policy plus resulting per-message count before publication; losing staged content is removed through compensation.`
);

appendOnce(
  "docs/security/TEST_AND_SECURITY_STRATEGY.md",
  "## Release 0.7 AccessGrant and concurrency coverage",
  `## Release 0.7 AccessGrant and concurrency coverage

Release 0.7 adds deterministic tests for Web Crypto secret issuance and verifier matching; raw-secret non-persistence; verifier non-exposure; wrong secret, deployment, thread, and operation denial; bounded lifetime; server-time expiry at the exact boundary; issue permission and terminal-thread denial; retained-record revocation and idempotent replay; current thread-state revalidation; conservative external denial; explicit external conversation projection minimization; and preservation of lifecycle/TransferAttestation independence.

The external projection regression verifies that queue ID, routing category, staff/external actor references, and audit metadata are absent. Grant issuance/revocation/retrieval audit serialization is checked to exclude raw secret and verifier material.

Release 0.7 also adds a deterministic two-writer barrier test for \`maxAttachmentsPerMessage\`. Both ingestion attempts pass the earlier application pre-check and stage content, but only one can publish when the authoritative limit is one; the losing staged content is compensated. Additional tests reject a stale attachment-policy reference and reject direct attachment publication that omits the authoritative count guard.

Every Release 0.2-0.6 regression remains in \`npm run validate\`. No new browser retrieval test exists because Release 0.7 intentionally adds no public external retrieval route.`
);

appendOnce(
  "docs/MVP_AND_ROADMAP.md",
  "## Release 0.7 implemented AccessGrant core",
  `## Release 0.7 implemented AccessGrant core

Release 0.7 implements temporary external thread-read authority without exposing it through a browser or notification channel: provider-neutral AccessGrant metadata/policy; explicit \`THREAD_READ\` only; server-generated 256-bit one-time bearer secret; persisted versioned SHA-256 verifier only; bounded server-time expiry; authorized issuance and retained-record optimistic revocation; conservative authoritative validation on every use; an external conversation projection excluding internal queue, actor, lifecycle, audit, and administrative metadata; minimized grant evidence; and authoritative transaction-time enforcement of the per-message attachment-count policy under concurrent ingestion.

External attachment retrieval is deferred so it can reuse the Release 0.6 clean-attachment retrieval/download-evidence path. External reply is deferred until an explicit lifecycle eligibility rule is approved. Also still deferred: public retrieval routes, email-link/notification delivery, production authentication, production persistence, AWS adapters/infrastructure, customer data, PHI, and regulated-deployment readiness.`
);

appendOnce(
  "docs/development/DEVELOPMENT.md",
  "## Release 0.7 development boundary",
  `## Release 0.7 development boundary

Release 0.7 remains application/domain plus synthetic local infrastructure. AccessGrant tests use an injectable clock and Web Crypto secret manager; concrete bearer secrets are generated only at runtime and must never be copied into fixtures, documentation, logs, screenshots, issues, or commits.

The only implemented grant operation is \`THREAD_READ\`. There is no public retrieval route, email-link generator, external attachment endpoint, or external reply endpoint. Do not add one without a later authorized delivery/security release.

The in-memory WorkflowStore now proves two additional transaction properties: AccessGrant issuance/revocation uses authoritative thread/version and policy checks, and new attachment publication requires a current policy/count guard at commit time. Future persistence adapters must reproduce these invariants using their own conditional/transactional mechanisms without leaking provider-specific concepts into domain/application contracts.

Focused Release 0.7 tests:

\`\`\`sh
npm test -- tests/unit/access-grant.test.ts
npm test -- tests/integration/access-grant-service.test.ts
npm test -- tests/integration/attachment-count-concurrency.test.ts
\`\`\``
);

writeFileSync(
  "docs/releases/0.7-access-grant-core.md",
  `# Release 0.7 — AccessGrant & External Retrieval Core Prototype

## Status

Release 0.7 is a provider-neutral application/domain and local-synthetic prototype. It implements temporary external thread-read authority but exposes no public retrieval route, email link, production identity flow, or cloud infrastructure.

## AccessGrant authority

An AccessGrant contains opaque grant/deployment/thread identifiers, an opaque external-participant actor reference, the current access-policy reference, a persisted verifier digest, explicit permitted operations, issue/expiry times, revocation state/time, and optimistic version. Release 0.7 implements only \`THREAD_READ\`; external attachment retrieval and external reply are deliberately deferred.

## Secret versus verifier

Issuance generates 32 random bytes with Web Crypto and encodes a bearer secret with a versioned prefix plus base64url random material. The raw secret is returned only in the issuance result. The repository persists only a versioned SHA-256 verifier. Grant ID, verifier, and opaque external-participant reference are all distinct from the bearer credential. No raw secret or verifier enters audit events, queue projections, external projection output, URLs, or committed fixtures.

## Issuance, validation, expiry, and revocation

Authorized issuance requires current STAFF/ADMIN authority, queue scope, \`ACCESS_GRANT_ISSUE\`, an authoritative eligible thread, current AccessGrant policy, an allowed requested operation, and bounded lifetime. External participant attribution is derived from authoritative external messages rather than caller input.

Validation rechecks the authoritative grant, bearer verifier, deployment/thread scope, explicit operation, revocation, server-time expiry, and current thread eligibility. \`EXPIRED\` and \`DISPOSED\` fail closed. Use does not extend expiry or transition lifecycle. Revocation requires \`ACCESS_GRANT_REVOKE\`, updates the retained grant with optimistic versioning, records minimized evidence, and is idempotent on exact replay.

## External projection

The application-only projection includes thread ID plus chronological message direction, creation time, and bounded plain-text body. It excludes message IDs, actor references, queue/routing fields, lifecycle/admin state, audit evidence, permission maps, and secret/verifier material.

## Attachment-count prerequisite

The Release 0.6 \`maxAttachmentsPerMessage\` pre-check is no longer the authoritative limit. New attachment publication carries a message + attachment-policy guard into the WorkflowStore transaction, which revalidates current policy and post-mutation count atomically. Concurrent losers fail publication and their staged protected content is compensated through the provider-neutral delete port. This correction does not authorize browser upload.

## Deliberate deferrals

External attachment retrieval is deferred so it can reuse Release 0.6 authoritative \`CLEAN\` state, protected-content retrieval, ownership checks, and download-evidence semantics. External reply is deferred because there is no approved external-reply lifecycle eligibility rule yet.

No public retrieval route, browser upload, notification/email delivery, production authentication/session, real customer identity, real malware scanner, AWS SDK/service, infrastructure, customer data, PHI, analytics, parsing/OCR/preview, or paid service is added.

## Cost and dependencies

Recurring cost: **$0**. Release 0.7 adds no runtime or development dependency; Web Crypto and existing platform APIs provide random-secret generation and SHA-256 verification.
`
);

const readmePath = "README.md";
let readme = readFileSync(readmePath, "utf8");
readme = readme.replace(
  /\*\*Release 0\.6 implements the Attachment Safety Core Prototype\.\*\*[\s\S]*?Release 0\.6 remains a synthetic\/local application prototype\.[\s\S]*?customer data, or PHI\.\n\n/,
  "**Release 0.7 implements the AccessGrant & External Retrieval Core Prototype.** It adds provider-neutral temporary external thread-read authority, one-time high-entropy bearer-secret issuance with verifier-only persistence, explicit expiry/revocation, a minimized external conversation projection, and authoritative concurrent attachment-count enforcement.\n\nRelease 0.7 remains application/domain + synthetic local infrastructure. It exposes no public external retrieval route, email-link delivery, production authentication, external attachment/reply endpoint, AWS infrastructure, customer data, or PHI.\n\n"
);
if (!readme.includes("tests/integration/attachment-count-concurrency.test.ts")) {
  readme = readme.replace(
    "npm test -- tests/unit/attachment.test.ts tests/integration/attachment-service.test.ts\n",
    "npm test -- tests/unit/attachment.test.ts tests/integration/attachment-service.test.ts\nnpm test -- tests/unit/access-grant.test.ts tests/integration/access-grant-service.test.ts tests/integration/attachment-count-concurrency.test.ts\n"
  );
}
if (!readme.includes("0.7-access-grant-core.md")) {
  readme = readme.replace(
    "- [Release 0.6 implementation boundary](docs/releases/0.6-attachment-safety-core.md)\n",
    "- [Release 0.7 implementation boundary](docs/releases/0.7-access-grant-core.md)\n- [Release 0.6 implementation boundary](docs/releases/0.6-attachment-safety-core.md)\n"
  );
}
writeFileSync(readmePath, readme);
