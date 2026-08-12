# Retention and Disposition

## Principle

Secure Exchange is an exchange workflow, not an implicit permanent records archive.

Retention is an application policy with an explicit disposition workflow.

## Lifecycle relationship

`COMPLETED` means workflow completion and starts/records the applicable disposition schedule.

`COMPLETED` does not mean deleted.

`DISPOSED` is terminal and represents completion of the product-controlled disposition action.

`EXPIRED` represents expiration of access/workflow where product policy requires it; it does not by itself prove underlying storage deletion.

## Policy model

A versioned retention policy defines:

- trigger state/event;
- retention duration;
- supported administrative bounds;
- disposition action;
- policy version/effective context.

A thread records enough policy/version context to make later disposition interpretation auditable.

## Authoritative disposition workflow

1. identify candidate records due for disposition;
2. load authoritative thread/policy state;
3. revalidate due time, lifecycle state, deployment, legal/administrative hold behavior if ever introduced, and current policy semantics;
4. revoke outstanding access grants as required;
5. delete or otherwise dispose of protected objects;
6. remove/minimize application records according to the approved data model;
7. record disposition outcome/audit evidence without retaining the sensitive content being disposed;
8. surface failures for retry/administrative attention.

## DynamoDB TTL

TTL may be used only as a cleanup/backstop mechanism.

It must not be:

- the authoritative scheduler;
- the proof that deletion happened at the required time;
- the mechanism used to promise timely regulated-data disposition.

Application-controlled disposition remains authoritative.

## S3/object storage

Deleting a database record without disposing of the corresponding protected object is incomplete.

Before production, the deployment design must document:

- object versioning behavior if enabled;
- lifecycle rules;
- backup/replication implications;
- malware-quarantine objects;
- failed uploads;
- multipart uploads;
- recovery copies.

## Logs and audit

Operational/infrastructure logs have their own retention and access policy.

Application audit events must be minimized so they can outlive disposed content when necessary without reconstructing message/document content.

## Default posture

Use conservative temporary retention for exchange content.

Permanent storage/records-management behavior is deferred and would require an explicit product/deployment decision.

## Holds and exceptions

Legal/records holds are not part of the initial MVP.

If introduced later, they require explicit domain semantics, authorization, audit, and disposition conflict handling rather than an undocumented “do not delete” flag.
