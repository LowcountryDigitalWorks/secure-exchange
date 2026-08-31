# Hushmail Vendor Evidence — 2026-08-31

Status: **VENDOR-CONFIRMED EVIDENCE — DOES NOT CHANGE CURRENT COMMERCIAL GATE OR AUTHORIZE IMPLEMENTATION**

Source: direct written response from Hushmail Sales received by Lowcountry Digital Works on 2026-08-31. This record summarizes the product/partner facts relevant to Secure Exchange without reproducing private correspondence or personal contact details.

## 1. Strategic disposition

This evidence reinforces the current Secure Exchange position:

- Hushmail remains a strong maintained solution when a healthcare customer primarily needs secure email, encrypted attachments, and a small number of secure forms with ordinary manual downstream filing.
- Hushmail may be recommended/configured by LDW without forcing Secure Exchange.
- Hushmail may remain an optional customer-owned communication provider around Secure Exchange where appropriate.
- Secure Exchange should **not** depend on Hushmail for its core workflow, protected-object lifecycle, authoritative malware state, event-driven intake, or downstream filing evidence.
- The accepted customer-owned AWS / provider-neutral Secure Exchange architecture remains unchanged.

## 2. Affiliate / implementation relationship

Hushmail confirmed its current healthcare affiliate arrangement for approved affiliates:

- affiliate receives a unique referral link;
- referred healthcare customer receives an extended 28-day trial instead of the standard 14-day trial;
- customer signs up for and owns the Hushmail account directly;
- customer retains its Hushmail Healthcare agreement/BAA directly with Hushmail;
- affiliate receives a one-time commission equal to 20% of first-year plan value when the referred customer subscribes;
- Hushmail does not prohibit LDW from separately providing implementation services such as migration, custom-domain/DNS configuration, setup, or general technology support while the customer retains account ownership.

Commercial implication:

This is consistent with LDW's customer-ownership model and provides a legitimate referral/service path when Hushmail is the better answer. The commission is supplemental; it should not distort build-vs-buy recommendations.

## 3. REST API / webhook surface

Vendor-confirmed:

- Hushmail has a REST API for approved integration partners.
- The currently described API use allows an external application/workflow to create and send an existing Hushmail Secure Form using an API key.
- Hushmail does **not** currently provide webhooks/events to notify an external application when a new email, completed Secure Form submission, or uploaded file is received.

Product implication:

The currently described API does not provide the event-driven inbound surface Secure Exchange would prefer for automatic intake. Secure Exchange should not assume Hushmail submission/inbox events can trigger its workflow.

## 4. IMAP automation

Vendor-confirmed:

- Hushmail supports IMAP over SSL/TLS, including Healthcare accounts.
- Standard IMAP authentication is username/password based.
- Two-step verification adds a security code when configuring a mail application.
- Hushmail does not currently advertise OAuth or a service-account authentication flow for IMAP.
- Hushmail Sales has not yet confirmed whether application-based automated IMAP access, as opposed to a standard mail client, is a supported intended use.

Product implication:

Automated IMAP polling remains **UNCONFIRMED FOR SUPPORTED APPLICATION USE**. Even if permitted, username/password-oriented authentication and polling are materially less attractive than event-driven, revocable service-identity integration. Hushmail IMAP must not become a required Secure Exchange dependency without further written support/terms confirmation and credential-handling review.

## 5. Spam / malware / attachment handling

Vendor-confirmed at a high level:

- Hushmail uses spam detection and attachment warnings.
- When detected by Hushmail's controls, technical teams are notified and emails may be blocked.

Evidence limitation:

The response does **not** establish an application-consumable authoritative malware/quarantine result, a documented fail-closed state machine available to Secure Exchange, or equivalent evidence specifically for all Secure Form uploads/compound files.

Product implication:

Hushmail controls may provide useful defense in depth, but they do not replace the Secure Exchange authoritative protected-object safety gate. The current S3 quarantine + fail-closed scanner design remains required for Secure Exchange-managed content.

## 6. Archive / deletion / lifecycle

Vendor-confirmed:

- Healthcare accounts include automatic email archiving.
- Copies of sent and received messages are retained in the account archive.
- Hushmail does not automatically delete data from inboxes or archives.
- deletion from inbox/archive would have to be specifically requested/managed.

Product implication:

This lifecycle differs materially from Secure Exchange's accepted transient-staging model:

`receive -> process/file into authoritative downstream system -> complete -> dispose temporary Secure Exchange copy`

If Hushmail is used in a customer workflow, Secure Exchange must not claim that disposing its own staging copy also deletes Hushmail's archived copy. Hushmail archive retention remains a separate customer/provider lifecycle.

## 7. Secure Form limits

Vendor-confirmed current limits:

- maximum 75 MB total uploaded through a Secure Form submission;
- maximum 20 MB per file;
- no vendor option to increase the individual attachment/file-size limit.

Current public Hushmail help documentation additionally states a maximum of 20 files per Secure Form submission.

Product implication:

The accepted Secure Exchange planning target of 500 MB/file and 1 GB/package remains materially differentiated for imaging/large-record workflows, subject to Release 0.15 production-readiness proof. These targets must not be represented as implemented until proven.

## 8. Programmatic processing / deletion

Vendor-confirmed:

- completed Secure Form submissions arrive in the Hushmail inbox;
- completed PDF and associated attachments can be downloaded manually;
- IMAP provides email access;
- the vendor response did not establish receive-side REST endpoints, webhook-driven download/export, or programmatic archive deletion.

Product implication:

Hushmail currently appears best treated as a human-facing secure communication/forms service unless further integration evidence closes these gaps.

## 9. EHR / practice-management integration

Vendor-confirmed typical workflow:

`Hushmail Secure Form -> Hushmail inbox -> manual download -> manual upload into EHR/practice-management system`

Hushmail intentionally remains EHR-neutral.

Product implication:

This confirms the Secure Exchange differentiation after secure intake: records work queue, WHO/WHAT/WHEN, patient/entity resolution, explicit FILED/transfer evidence, outbound pickup evidence, transient disposition, large-file workflow, and future downstream adapters.

## 10. Customer ownership / support relationship

Hushmail indicated that it normally remains the primary point of contact for account setup, billing, and ongoing Hushmail support, but asked LDW to clarify whether LDW expects to act as the primary client contact.

Current LDW preferred model:

- customer owns Hushmail account, billing, agreement and BAA directly when Hushmail is selected;
- Hushmail remains authoritative for Hushmail product/account support;
- LDW may provide separately scoped implementation/configuration/migration/general technology assistance;
- for Secure Exchange, LDW owns/supports the Secure Exchange product relationship while Hushmail, if present, remains only a replaceable customer-owned communication provider;
- LDW should not promise to replace Hushmail support or take custody of owner credentials/MFA/recovery.

## 11. Remaining vendor questions

Still worth confirming before any automated Hushmail adapter is considered:

1. Is customer-owned AWS application polling via IMAP an explicitly supported Healthcare use under Hushmail terms/BAA?
2. Can IMAP/application credentials be independently scoped, revoked, or rotated without sharing the user's normal mailbox password?
3. Does IMAP expose the archive and folder lifecycle needed for deterministic processing, and what exactly happens to the archive when a message is deleted through IMAP?
4. Do Secure Form uploaded files receive the same attachment-malware blocking controls described for email, including archives/compound content?
5. Is the current REST API strictly outbound form-send functionality, with no receive/read/download/delete API surface?

These questions are **not blockers** for the accepted Secure Exchange customer-owned AWS path because Hushmail is not a required dependency.

## 12. Current recommendation

- **Simple secure email/forms need:** recommend/configure Hushmail or another maintained solution.
- **Deeper bidirectional records workflow:** evaluate Secure Exchange.
- **Hushmail + Secure Exchange:** possible optional coexistence, but do not design Secure Exchange around Hushmail until the remaining integration questions are resolved.
- **Affiliate relationship:** useful and aligned with LDW customer ownership; pursue only as a recommendation/service channel, not as a reason to force Hushmail.

No production integration, provider credentials, customer changes, PHI, BAA execution, DNS/mail changes, purchases, or Release 0.15 implementation are authorized by this evidence record.
