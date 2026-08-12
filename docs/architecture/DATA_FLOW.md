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
