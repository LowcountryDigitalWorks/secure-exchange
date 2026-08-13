# Data Flow and Trust Boundaries

## Principles

- data minimization;
- no sensitive content in ordinary notifications;
- opaque access identifiers;
- server-side authorization;
- malware status gates attachment availability;
- application-controlled disposition;
- explicit, distinct workflow evidence for opened/read, download, transfer/filing attestation, and completion;
- explicit audit events for meaningful workflow/security actions.

## Flow A — External submission

1. External participant opens the public submission endpoint.
2. The application supplies only non-sensitive configurable routing choices.
3. Participant submits minimal metadata and optional message content.
4. The application validates request size, field limits, abuse controls, and allowed routing.
5. A deployment-bound thread is created using an authoritative transaction.
6. Attachment upload authorization is created only for that thread and deployment.
7. Uploaded objects land in protected object storage in a non-releasable/quarantine state.
8. Malware scanning updates attachment safety status through a validated adapter event.
9. Clean attachments become eligible for authorized retrieval; rejected/suspicious attachments remain blocked.
10. The application emits audit events without copying message/file content into audit details.
11. Staff receive a non-sensitive notification or queue indication.

## Flow B — Staff access and download evidence

1. Staff authenticates through the configured identity-provider adapter.
2. The server resolves identity and role/queue grants from trusted configuration/authoritative records.
3. Queue views may use indexed metadata to identify candidate threads.
4. Opening a thread causes the server to validate the authoritative thread/deployment record and current authorization.
5. An authorized open/read action may append distinct opened/read evidence. This does not imply that any attachment was downloaded.
6. Message/attachment metadata is returned only after authorization.
7. Object download access is issued narrowly and for a short lifetime after authoritative authorization and attachment-state validation.
8. A successful authorized download produces distinct download evidence. Download evidence does not imply that the file was transferred or filed in any downstream system.
9. State changes and replies produce their own application audit events where required.

An eventually consistent queue index is never sufficient proof of authorization.

## Flow C — Secure outbound reply/retrieval

1. Authorized staff creates a reply on an authoritative thread.
2. Message/attachment records are committed with corresponding audit events through the application transaction boundary.
3. Sensitive content remains in Secure Exchange storage.
4. The notification adapter sends only non-sensitive text and an opaque retrieval entry point.
5. External retrieval uses an expiring, revocable access grant.
6. The server exchanges/validates the grant before returning thread content.
7. Access events are audited.

The exact higher-assurance verification mechanism for external retrieval remains an implementation security decision and must be resolved before a regulated production deployment. A compromised email account is explicitly in scope and must not be ignored.

## Flow D — Transfer/filing attestation

1. After authorized review or download, staff may transfer/file information into an approved downstream destination outside Secure Exchange.
2. Secure Exchange must not infer that this downstream action occurred merely because a thread was opened or a file was downloaded.
3. Where downstream transfer/filing cannot be technically proven, an authenticated and authorized staff user explicitly submits a `TransferAttestation` for the authoritative deployment/thread.
4. The application validates actor authority, deployment/thread ownership, allowed destination category, outcome, and configured policy requirements.
5. A qualifying attestation records the actor reference, deployment/thread, timestamp, outcome, destination category, policy reference as needed, and only minimal non-sensitive metadata.
6. The attestation and related audit evidence are persisted through the provider-neutral repository/transaction boundary.
7. A failed, superseded/invalid, wrong-deployment, or otherwise non-qualifying attestation remains evidence but cannot satisfy a completion requirement.

## Flow E — Completion and disposition

1. Authorized staff requests transition of a thread to `COMPLETED`.
2. The application loads the authoritative thread and current completion policy.
3. If policy requires transfer/filing evidence, the application authoritatively retrieves and validates a qualifying `TransferAttestation` for the same deployment/thread. A cached/indexed summary is insufficient.
4. If a required qualifying attestation is absent, the completion request fails closed and the lifecycle state does not change.
5. If all configured completion preconditions are satisfied, the application transitions the thread to `COMPLETED` using expected-state/version controls and records completion audit evidence.
6. Completion records the disposition schedule derived from approved retention configuration.
7. A disposition process queries authoritative due records.
8. The application verifies current state and disposition eligibility.
9. Protected objects are deleted or moved according to the approved disposition policy.
10. Application state is removed/minimized as specified.
11. A disposition audit event records the outcome without retaining sensitive content.
12. DynamoDB TTL, if configured, serves only as delayed cleanup/backstop.

Completion therefore does not prove that a thread was opened, a file was downloaded, or a transfer occurred unless the applicable independent evidence exists. Likewise, those evidence facts do not themselves imply completion.

## Flow F — Infrastructure/security telemetry

CloudTrail/CloudWatch and equivalent infrastructure logs record infrastructure/security events.

Secure Exchange application audit events record product/workflow semantics.

Neither log class should copy message bodies, document contents, secret access grants, or unnecessary sensitive metadata.

## Trust boundaries

| Boundary | Untrusted/less trusted side | Trusted side | Primary controls |
|---|---|---|---|
| Public web | External browser/internet | Public application endpoint | validation, rate limiting, TLS, size limits |
| Staff web | Staff browser | Application API | IdP authentication, server authorization, CSRF/session controls |
| Identity | Claims/token input | Application identity context | signature/issuer/audience validation, mapping |
| Persistence | Provider API | Repository abstraction | scoped IAM, deployment keys, conditional writes |
| Objects | Upload/download requests | Protected object storage | opaque keys, scoped grants, encryption, malware gate |
| Notifications | Email transport | Secure Exchange content store | non-sensitive notifications only |
| Logging | Runtime/provider telemetry | Audit/ops consumers | minimization, access control, no sensitive payload logging |

## Release 0.5 local development browser flow

Release 0.5 adds a local-only delivery path while preserving the existing provider-neutral application boundary:

1. A development browser GET renders a synthetic external form only when the explicit demo configuration is enabled.
2. The external POST supplies only a bounded routing choice and synthetic message body. The server supplies deployment/queue context and generates opaque participant, thread, message, and audit identifiers.
3. ConversationService validates routing and atomically creates the thread, first immutable message, and minimized audit events in the local in-memory adapter.
4. The synthetic staff queue GET calls listQueueCandidates() and renders metadata only.
5. Opening is an explicit POST through openStaffConversation(), which records distinct Opened evidence and redirects.
6. The redirected conversation GET performs a fresh authoritative THREAD_OPEN check through readStaffConversation() before rendering message content.
7. Staff reply is an explicit expected-version POST through replyToConversation(); the application/domain reply-state rule is enforced before mutation.

No GET mutates application state. The confirmation page grants no external conversation access. There is still no external retrieval/access-grant flow.

The local browser trust boundary adds server-side HTML escaping, no-store caching, restrictive CSP, and a same-origin mutation check using browser Fetch Metadata when present with a strict Origin/host/request-URL fallback for non-browser test callers.

## Release 0.6 attachment ingestion, scan, and retrieval flows

Release 0.6 adds three application-only synthetic flows.

**Ingestion:** the application validates authoritative deployment/thread/message ownership and the current attachment policy before touching protected content. It generates opaque attachment/content references server-side, stages a copy of synthetic bytes through `ProtectedContentStore`, then atomically publishes `QUARANTINED` metadata plus minimized registration/quarantine audit events. If protected-content staging fails, no metadata is published. If metadata publication fails after staging, the application attempts provider-neutral staged-content deletion as compensation and reports failure; it never pretends object storage and metadata share one physical transaction.

**Scan result:** a narrow trusted SYSTEM application boundary receives only a bounded normalized scan-result reference and normalized outcome. It revalidates deployment/thread/message/attachment association and current attachment state, applies the versioned transition, and commits state plus minimized audit together. No scanner raw payload or file bytes enter application audit.

**Staff retrieval:** the application first validates actor deployment, authoritative thread, live staff authorization, queue scope, `ATTACHMENT_READ`, authoritative message, attachment deployment/thread/message association, exactly `CLEAN` safety state, and no deletion marker. Only after those checks does it resolve bytes through `ProtectedContentStore`. Missing/failed/inconsistent content fails with no download evidence. Once bytes resolve successfully, the application commits `ATTACHMENT_DOWNLOADED`; only after that audit commit succeeds does it return a provider-neutral retrieval result.

Release 0.6 adds no browser upload/download route, permanent/public URL, AccessGrant, presigned URL, filesystem path, or AWS object-store contract.

## Release 0.7 AccessGrant issuance and external-read flow

Release 0.7 adds application-only external authority; it does not add a public retrieval route or email-link delivery.

**Issuance:** an authorized STAFF or ADMIN actor with current queue scope and `ACCESS_GRANT_ISSUE` requests bounded `THREAD_READ` authority for an authoritative thread. The application loads current grant policy, verifies current thread eligibility, derives the single opaque external-participant reference from authoritative external messages, obtains server time, generates a 256-bit random bearer secret and one-way verifier, and atomically stores only the grant/verifier plus minimized `ACCESS_GRANT_ISSUED` evidence. The raw secret is returned only in the issuance result.

**Validation and retrieval:** a caller must present deployment, thread, grant ID, raw secret, and the requested operation. The application loads the authoritative grant, verifies the secret against the stored verifier, checks revocation and server-time expiry, confirms the explicit operation, reloads the authoritative thread and current eligible lifecycle state, then returns only the external conversation projection. Grant ID, thread ID, queue candidates, or previously valid state never substitute for bearer-secret proof. Successful retrieval appends minimized `EXTERNAL_THREAD_RETRIEVED` evidence without the raw secret or verifier.

**Revocation:** an authorized `ACCESS_GRANT_REVOKE` action updates the retained grant record with optimistic version protection and `revokedAt`; exact replay is idempotent and does not duplicate revocation evidence. Revocation immediately causes later validation to fail.

The external projection contains only thread ID plus chronological message direction, creation time, and bounded message body. It excludes queue/routing data, lifecycle/admin metadata, message IDs, actor references, audit events, permissions, and grant verifier material.

External attachment retrieval remains deferred so a later release can reuse the Release 0.6 authoritative clean-attachment/content/download-evidence path rather than create a parallel implementation. External reply is also deferred because no approved external-reply lifecycle eligibility rule exists yet.

Release 0.7 also closes the Release 0.6 attachment-count race: attachment publication carries a message-scoped current-policy guard into the authoritative metadata transaction. The transaction rechecks the current policy and post-mutation count, and a losing concurrent staged object is compensated through the provider-neutral protected-content delete operation.

## Release 0.8 external attachment retrieval flow

1. The caller presents deployment ID, thread ID, grant ID, bearer secret, message ID, and attachment ID to the application-layer external retrieval service.
2. Existing AccessGrant validation authoritatively proves verifier match, deployment/thread scope, explicit `ATTACHMENT_READ`, unrevoked state, server-time expiry, and current thread eligibility.
3. The shared attachment retrieval path loads the authoritative message and attachment and verifies deployment/thread/message ownership.
4. Retrieval proceeds only when the attachment is exactly `CLEAN` and not deleted.
5. Protected content is resolved through the existing provider-neutral content port and its returned byte length must equal authoritative attachment metadata.
6. Only after successful content and integrity validation is minimized `ATTACHMENT_DOWNLOADED` evidence committed with opaque external actor/grant attribution.
7. The application returns only safe download filename, normalized media type, byte length, and bytes required by a future delivery adapter.

Staff retrieval follows the same steps after its separate current staff/queue authorization gate. There is no second weaker attachment safety pipeline.

## Release 0.9 browser external retrieval development flow

1. A server-rendered development form accepts opaque thread/grant references and the raw AccessGrant bearer secret only by same-origin POST. Deployment context remains server-held.
2. The delivery adapter proves that the presented grant still authorizes at least one explicit external operation, then stores only the bounded thread/grant selectors plus raw bearer in a host-only, HttpOnly, SameSite=Strict capability cookie scoped to `/demo/external/access` for at most 600 seconds. HTTPS responses add `Secure`; no `Domain` attribute is set.
3. The cookie is transport only. Every protected read/download revalidates the authoritative AccessGrant. `THREAD_READ` and `ATTACHMENT_READ` remain independent.
4. Conversation GET delegates to the existing bounded external conversation projection and may append `EXTERNAL_THREAD_RETRIEVED` evidence without lifecycle mutation.
5. Attachment candidate GET delegates to a provider-neutral projection that exposes only safe filename, normalized media type, bounded size, and opaque message/attachment selectors for currently `CLEAN` attachments.
6. Attachment download is same-origin POST and delegates directly to the Release 0.8 external retrieval service. The response is attachment-only with defensive `Content-Disposition`, normalized media type, exact length, `nosniff`, `no-store, private`, `no-referrer`, and same-origin resource policy.
7. End-access POST expires the browser capability cookie only; it does not revoke the authoritative AccessGrant.

## Release 0.10 external reply application flow

1. The caller presents deployment/thread/grant selectors, the raw AccessGrant bearer secret, and a bounded plain-text reply body to the application service.
2. Existing AccessGrant validation proves the verifier, deployment/thread scope, explicit `THREAD_REPLY`, unrevoked state, authoritative server-time expiry, and current broad external-access eligibility.
3. The application separately enforces external-reply lifecycle eligibility: `NEW`, `IN_PROGRESS`, `AWAITING_EXTERNAL`, and `AWAITING_STAFF` only. `COMPLETED`, `EXPIRED`, and `DISPOSED` fail closed.
4. The application derives the external actor from the grant's authoritative `externalParticipantRef`, validates the existing plain-text body rules, and generates message/audit identifiers plus timestamp server-side.
5. The thread activity update advances `updatedAt`, `lastActivityAt`, and `attentionAt` to the new external activity time without changing lifecycle state or creating unread/read-receipt semantics.
6. One expected-version `WorkflowStore` mutation atomically publishes the immutable `EXTERNAL_TO_STAFF` message, updated thread, and minimized `MESSAGE_APPENDED` evidence. A stale or failed commit publishes none of the reply artifacts.

No reply creates `THREAD_OPENED`, `ATTACHMENT_DOWNLOADED`, TransferAttestation, completion evidence, or an automatic lifecycle transition. Browser reply delivery is not part of this release.

## Release 0.11 external browser reply flow

Synthetic credential POST -> scoped HttpOnly capability cookie -> server-rendered reply form -> same-origin reply POST -> Release 0.10 AccessGrant reply service -> atomic message/activity/attention/audit commit -> fixed local 303 confirmation.

The capability secret and reply body never enter path, query, fragment, or redirect data. The reply application transaction preserves both expected-thread-version concurrency and the AccessGrant authority/version/expiry guard. A failed authority or lifecycle check publishes no reply message, activity/attention change, or reply audit evidence.

