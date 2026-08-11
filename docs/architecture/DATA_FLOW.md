# Data Flow and Trust Boundaries

## Principles

- data minimization;
- no sensitive content in ordinary notifications;
- opaque access identifiers;
- server-side authorization;
- malware status gates attachment availability;
- application-controlled disposition;
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

## Flow B — Staff access

1. Staff authenticates through the configured identity-provider adapter.
2. The server resolves identity and role/queue grants from trusted configuration/authoritative records.
3. Queue views may use indexed metadata to identify candidate threads.
4. Opening a thread causes the server to validate the authoritative thread/deployment record and current authorization.
5. Message/attachment metadata is returned only after authorization.
6. Object download access is issued narrowly and for a short lifetime.
7. Access, download, state changes, and replies produce application audit events where required.

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

## Flow D — Completion and disposition

1. Authorized staff transitions a thread to `COMPLETED`.
2. Completion records the disposition schedule derived from approved retention configuration.
3. A disposition process queries authoritative due records.
4. The application verifies current state and disposition eligibility.
5. Protected objects are deleted or moved according to the approved disposition policy.
6. Application state is removed/minimized as specified.
7. A disposition audit event records the outcome without retaining sensitive content.
8. DynamoDB TTL, if configured, serves only as delayed cleanup/backstop.

## Flow E — Infrastructure/security telemetry

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
