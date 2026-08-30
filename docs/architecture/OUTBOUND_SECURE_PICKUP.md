# Outbound Secure Pickup and Bidirectional Exchange Direction

Status: **PRE-PRODUCTION DESIGN DIRECTION — DOCUMENTATION ONLY**

This document extends the accepted external-access and customer-deployment architecture so Secure Exchange can support customer-to-external-recipient delivery without sending protected files as ordinary email attachments.

It does not authorize production AWS resources, real email delivery, PHI, customer data, DNS changes, BAA execution, or a new functional release.

## Objective

Secure Exchange should support both directions of secure records movement through one provider-neutral workflow model:

- **Send Us Records** — external sender to customer (inbound/drop-off);
- **Secure Pickup** — customer staff to external recipient (outbound/pickup).

Both directions should converge on the same protected-content, malware-state, authorization, evidence, retention, and disposition semantics.

Secure Exchange is not a general email replacement. Ordinary email is used only for non-sensitive notification/routing where appropriate; protected files remain inside the Secure Exchange trust boundary.

## Customer and external UX terminology

### Customer staff surface

Recommended standardized navigation concepts:

- Received Records;
- Sent Records;
- New Secure Send;
- Needs Attention;
- Completed;
- Administration.

The staff dashboard should expose inbound and outbound work through the same WHO / WHAT / WHEN evidence model.

### External surface

Recommended customer-branded actions:

- **Send Us Records** — secure upload into the customer workflow;
- **Pick Up Secure Records** — retrieve records the customer has sent.

The external surface should remain customer-first branded with discreet `Secure Exchange by Lowcountry Digital Works` or equivalent attribution.

## Canonical outbound flow

Reference conceptual flow:

```text
customer staff
    |
    v
New Secure Send
    |
    +--> choose recipient
    +--> add protected files
    +--> set bounded pickup expiry/policy
    |
    v
protected quarantine
    |
    v
authoritative malware decision
    |
    v
create outbound thread/package + AccessGrant
    |
    v
send NON-SENSITIVE notification
    |
    v
recipient opens Secure Pickup bootstrap
    |
    v
one-time proof / external session
    |
    v
view / download permitted files
    |
    +--> optional secure reply/upload where authorized
    |
    v
receipt/download evidence
    |
    v
expiry / revocation
    |
    v
transient-copy disposition
```

Outbound content must not bypass the accepted attachment-safety contract merely because the sender is authenticated customer staff. Every protected outbound file must have an authoritative acceptable malware state before external retrieval is permitted.

## Outbound package creation

A future staff workflow should allow an authorized user to create an outbound package with bounded metadata such as:

- recipient email address;
- optional recipient display name / organization;
- internal thread/package purpose/category;
- protected attachments;
- approved expiry/pickup window;
- allowed external operations;
- optional non-sensitive notification wording;
- optional secure in-portal message content;
- downstream/customer policy reference.

Protected message content, patient/client/matter information, filenames that disclose sensitive content, or other PHI/sensitive data must not be copied into ordinary notification email subjects/bodies.

## Outbound file limits

The existing production planning target remains:

- **500 MB maximum individual file**; and
- **1 GB maximum total submission/package**.

Those are planning targets, not implemented Release 0.14 limits.

Large files should use protected direct object upload/download rather than traverse an application API body unnecessarily.

## Notification delivery

The preferred reference notification adapter may use customer-owned Amazon SES or another separately approved provider-neutral notification adapter.

For the AWS reference deployment:

- use a customer-owned verified sending identity/subdomain;
- configure SPF/DKIM/DMARC-aligned sending as approved for that deployment;
- request SES production sending access before real external use;
- keep notification email non-sensitive even though SES is an AWS HIPAA-eligible service when used under the applicable BAA;
- do not attach protected records to the email;
- do not place active AccessGrant/bootstrap/session secrets in the email URL;
- process bounce/complaint/delivery outcomes as operational notification evidence, not proof the intended human accessed the package.

A notification may contain:

- the customer organization name;
- a generic statement that a secure package is available;
- the exact Secure Exchange customer portal URL containing only a non-secret opaque bootstrap locator;
- a generic expiration statement/date where appropriate;
- customer support contact information.

A notification should not contain patient/client/matter names, diagnoses, treatment information, protected filenames, record descriptions, or other sensitive content unless a separately approved legal/security requirement explicitly permits it.

## Bootstrap and external session reuse

Outbound pickup should reuse the accepted Release 0.12 external-delivery boundary rather than create a second security mechanism.

The existing invariants remain authoritative:

- bootstrap URL contains only a non-secret opaque locator;
- active proof/session secrets never appear in URLs;
- one-time proof is short-lived, attempt-bounded, and verified through a keyed/non-reversible verifier;
- successful bootstrap creates a new short-lived external browser session;
- one active external browser session per AccessGrant is the current reference policy;
- every protected operation revalidates the current authoritative AccessGrant and explicit operation;
- external failures remain generic and fail closed;
- logout/reissue/revocation invalidate delivery state as specified by the accepted external-delivery contract.

### Recommended mailbox-only usability refinement

A future implementation may improve normal `MAILBOX_ONLY` usability by delaying one-time proof delivery until after the recipient intentionally requests a code from the Secure Pickup page.

Reference flow:

1. non-sensitive notification contains only the non-secret locator link;
2. GET renders the bootstrap page and consumes/mutates nothing;
3. recipient explicitly POSTs `Send access code` through the accepted pre-session request-integrity boundary;
4. Secure Exchange sends a short-lived one-time code to the pre-authorized recipient mailbox;
5. recipient enters that code to establish the external session.

This remains **MAILBOX_ONLY**, not MFA, because the same mailbox remains the trust anchor. It primarily reduces accidental exposure and scanner/prefetch interaction with the one-time proof.

Customers requiring protection against mailbox compromise must use `INDEPENDENT_CHALLENGE` or another separately approved stronger identity mechanism.

## External pickup authorization

A standard outbound pickup grant should be least-privilege.

Expected explicit operations may include:

- `THREAD_READ` where secure in-portal message context is allowed;
- `ATTACHMENT_READ` for protected retrieval;
- `THREAD_REPLY` only when a secure reply is intentionally enabled;
- future explicit upload/reply-attachment authority only after separately implemented and reviewed.

Possession of a package/thread/attachment identifier, notification email, locator URL, browser session, or prior successful access is never sufficient authority.

## Timer and expiry model

Package access lifetime and browser session lifetime are separate concepts.

### Package / AccessGrant availability

The outbound package should have a bounded pickup deadline selected from customer/product policy.

Examples for future policy evaluation may include 24 hours, 48 hours, 72 hours, or a bounded multi-day maximum. The exact default/max remains a later production-policy decision.

The staff and external UI should show:

- exact expiry date/time and timezone;
- human-readable remaining time;
- status such as Active, Expiring Soon, Expired, Revoked, or Disposed.

Staff may be allowed to extend/reissue only within bounded policy and authorization rules. Reissue must invalidate superseded bootstrap/session delivery state as required by the accepted external-delivery boundary.

### Browser session

The existing external-session reference bounds remain independent:

- 20-minute absolute lifetime;
- 10-minute idle lifetime;
- no silent extension beyond absolute expiry;
- one active external browser session per AccessGrant.

### Download limits

A future policy may support a bounded number of successful downloads per package or attachment, but should not assume one-time download by default because large transfers may require retry after a network interruption.

Any download ceiling must count authoritative successful download evidence, fail closed when exhausted, and remain distinct from opening/viewing the package.

## Evidence semantics

Outbound workflow adds notification/pickup facts without collapsing existing evidence meanings.

Recommended evidence distinctions:

**Created != Notification Sent != Notification Delivered != Opened != Downloaded != Receipt Confirmed != Expired != Revoked != Disposed.**

Definitions:

- **Created** — authorized staff created the outbound package;
- **Notification Sent** — Secure Exchange submitted a non-sensitive notification to the provider;
- **Notification Delivered** — provider delivery telemetry indicates delivery to the receiving mail system; this is not human receipt;
- **Opened** — an authorized external session accessed the protected package/thread;
- **Downloaded** — protected bytes were successfully delivered under current authorization;
- **Receipt Confirmed** — optional explicit recipient acknowledgement if implemented;
- **Expired** — pickup authority is no longer valid due to time;
- **Revoked** — customer staff/system explicitly invalidated pickup authority;
- **Disposed** — Secure Exchange transient protected copy was actually removed according to policy.

No event may be inferred from another merely for convenience.

## Staff outbound dashboard

A future standardized `Sent Records` view should make the workflow operationally obvious without exposing raw audit logs.

Suggested columns/cards:

- recipient;
- package/category;
- created by;
- sent time;
- pickup expiry / countdown;
- notification outcome;
- opened state/time;
- downloaded state/time/count;
- optional receipt confirmation;
- current status;
- disposition schedule/status.

Authorized staff actions may include:

- view package details/evidence;
- resend a non-sensitive notification;
- revoke access immediately;
- reissue access under bounded policy;
- extend expiry within policy where permitted;
- end access;
- view bounce/complaint failure state;
- trigger or review disposition where policy permits.

`Resend notification` must not silently create additional independent authority unless policy explicitly reissues the grant/challenge.

## External pickup UX

After successful bootstrap, the customer-branded pickup page should show only information the active AccessGrant permits.

Potential layout:

- customer organization identity/logo;
- `Secure Records Pickup` heading;
- clear expiry/countdown;
- secure in-portal message/context;
- attachment list with size/type and safe-state indication where useful;
- download action;
- optional receipt acknowledgement;
- optional secure reply/upload when authorized;
- logout/end-access action;
- privacy/support links;
- authorized-use notice.

Do not require third-party analytics, fonts, scripts, pixels, or embeds on bootstrap/pickup pages.

## Bidirectional thread roadmap

The preferred long-term model is one secure thread capable of controlled bidirectional exchange rather than unrelated one-off file-share products.

Potential future capabilities:

- customer sends secure package;
- external recipient replies securely;
- external recipient uploads additional protected files;
- customer staff receives the reply/attachments in the same Secure Exchange queue;
- all new attachments re-enter quarantine/scanning before release;
- outbound/inbound evidence remains distinct and attributable;
- records may later be filed into Open Dental, Dentrix, an EHR/EMR, legal DMS/case system, or another downstream adapter without changing the core delivery semantics.

No future reply/upload capability may bypass the same attachment-safety, authorization, audit, retention, or disposition controls used for ordinary inbound records.

## Retention and disposition

Outbound access expiry is not disposition.

A package may become inaccessible at the pickup deadline while protected content remains temporarily retained for a bounded disposition/grace workflow.

Secure Exchange must represent:

**Expired != Revoked != Disposed.**

Disposition remains application-controlled and authoritative. Provider/object-store lifecycle cleanup or DynamoDB TTL may be a backstop only and must not be represented as timely policy enforcement.

Legal/preservation holds or other documented customer requirements can override ordinary deletion only through separately approved policy behavior.

## Cost direction

Outbound notification cost should remain negligible at small-practice volume because notifications are small and SES is usage-priced. Cost is not a reason to attach protected files to email.

The cost model must continue to account for:

- protected S3 storage duration;
- GuardDuty malware scanning volume/object count;
- data transfer where applicable;
- notification delivery;
- KMS/logging/runtime usage;
- any future higher-assurance verification channel.

## Production hardening requirements

Before real outbound use, validate at minimum:

- SES verified identity, DKIM/SPF/DMARC alignment and production-access process;
- bounce/complaint/delivery event handling;
- non-sensitive notification templates;
- AccessGrant issuance/revocation/reissue policy;
- package expiry/default/max policy;
- direct protected download authorization and short-lived object retrieval grants;
- large-download interruption/retry behavior;
- successful-download evidence semantics;
- optional download-count limits;
- external session/logout/revocation behavior;
- delayed one-time-code issuance if adopted;
- optional `INDEPENDENT_CHALLENGE` adapter if required;
- customer authorized-use/privacy notice wording;
- outbound disposition/grace behavior;
- bidirectional reply/upload behavior before enabling external attachment replies;
- synthetic end-to-end tests for notification -> bootstrap -> pickup -> evidence -> expiry/revocation -> disposition.

## Explicit non-authorization

This direction does not authorize:

- sending real external email;
- real SES production-access requests;
- DNS/SPF/DKIM/DMARC changes;
- production AWS resources;
- PHI/customer records;
- BAA execution;
- real external pickup links;
- production Secure Exchange deployment;
- external upload/reply implementation;
- automatic downstream writes;
- a new functional release.

It records the intended outbound/bidirectional product boundary so the next authorized architecture/development gate can implement one coherent Secure Exchange workflow rather than bolting on an unrelated file-sharing subsystem.