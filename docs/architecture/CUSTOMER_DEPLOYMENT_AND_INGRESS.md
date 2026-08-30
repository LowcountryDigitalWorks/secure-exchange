# Customer Deployment, Ingress, Branding, and Repeatability Direction

Status: **PRE-PRODUCTION DESIGN DIRECTION — DOCUMENTATION ONLY**

This document refines the accepted AWS-first, customer-owned, isolated deployment model for future production design. It does not authorize production AWS resources, PHI, DNS/mail changes, provider configuration, BAA execution, or a new functional Secure Exchange release.

## Objective

Secure Exchange should become a repeatable bolt-on workflow that fits between a customer's supported business-mail environment and the customer's authoritative downstream system.

The goal is:

- one reusable product core;
- one standardized customer-owned AWS reference deployment;
- zero customer-specific source-code forks for ordinary installations;
- customer-specific differences expressed through bounded configuration;
- mail-provider differences handled as routing/integration configuration rather than rewritten application behavior;
- rapid remote deployment from GitHub after the first production architecture is validated;
- low recurring infrastructure cost;
- provider-neutral product semantics;
- portable customer ownership and handoff.

The intended commercial/operational pattern is therefore:

**existing supported business mail -> Secure Exchange -> downstream authoritative system**

Secure Exchange is not intended to become the customer's general mailbox, document-management suite, permanent records archive, or full office-productivity platform.

## Standardized customer-owned reference deployment

The preferred future production reference remains one isolated AWS deployment per customer, owned by that customer.

The standardized deployment should use only the smallest justified serverless components. Candidate reference components include:

- CloudFront or another approved AWS HTTPS/static-delivery layer for the Secure Exchange browser application;
- Amazon Cognito for staff identity where the reference identity adapter is used;
- API Gateway + Lambda for application/API execution where their operational controls justify the additional layer;
- DynamoDB for workflow/application state behind provider-neutral repositories;
- private S3 for temporary protected content/object staging;
- GuardDuty Malware Protection for S3 as the reference authoritative malware-scanning adapter;
- customer-managed KMS controls where retained by the production security gate;
- CloudTrail + conservative CloudWatch/EventBridge telemetry;
- standard Systems Manager parameter storage or another separately approved customer-owned secret/configuration mechanism;
- GitHub Actions using short-lived OIDC role assumption for controlled deployment.

Avoid adding EC2, RDS, NAT Gateway, load balancers, Kubernetes, OpenSearch, paid monitoring SaaS, paid AWS support tiers, multi-region replication, or other recurring-cost infrastructure unless a demonstrated production requirement justifies it.

AWS is the reference production runtime target, not a domain dependency. Provider-neutral application ports remain authoritative.

## Canonical ingress model

Secure Exchange should support two converging intake paths.

### 1. Mail-routing ingress for ordinary records

A customer-visible address such as `records@customer.example` remains on the customer's supported business-mail provider.

The mail provider applies a supported routing/redirect rule that delivers qualifying records mail to a customer-specific Secure Exchange ingress destination.

Preferred behavior:

- route/redirect rather than retain-and-forward where the provider supports it;
- avoid creating an unnecessary second provider mailbox copy;
- if the provider can only forward and retain a copy, document that retained provider copy in the customer's transient-data/retention model;
- provider configuration is an adapter/runbook concern, not customer-specific application code;
- the application must not trust the mail provider's spam/virus result as the authoritative attachment-release decision.

A future AWS ingress adapter may use SES receipt handling where separately validated. Ordinary email remains size-constrained by mail-provider/SES limits; large imaging or record packages should use the secure portal instead.

### 2. Direct secure portal for large/preferred submissions

The browser upload path should support a production planning target of:

- **500 MB maximum individual file**; and
- **1 GB maximum total submission**.

These are planning targets, not implemented Release 0.14 limits. The current synthetic 2 MiB attachment policy is explicitly a development/prototype boundary and is not production sizing.

The intended large-file path is browser -> short-lived authorized direct upload -> private quarantine object storage -> authoritative malware gate -> Secure Exchange workflow.

Do not proxy large binaries through an API layer when direct protected object upload provides the same or stronger control with lower cost/complexity.

## Unified processing pipeline

Mail ingress and portal upload should converge before business workflow processing.

Reference conceptual flow:

```text
mail routing / secure portal
          |
          v
protected quarantine
          |
          v
authoritative malware decision
          |
          v
Secure Exchange records queue
          |
          v
resolution / classification
          |
          v
downstream filing or transfer
          |
          v
FILED / Transferred evidence
          |
          v
completion
          |
          v
transient-copy disposition
```

Existing evidence invariants remain unchanged:

**Opened != Downloaded != Transferred/Filed != Completed != Disposed.**

Mail-provider behavior, preview, or safety scanning must not collapse those facts.

## Supported mail-provider philosophy

Secure Exchange should not require one mail/productivity provider.

Candidate provider families include:

- Zoho Mail;
- Microsoft Exchange / Microsoft 365;
- Google Workspace Gmail;
- healthcare-focused providers such as Hushmail where their supported automation/routing model is adequate;
- other providers only after a bounded capability/BAA/security review.

WorkDrive, SharePoint, OneDrive, Google Drive, and other provider storage are **not required** for the initial standardized Secure Exchange reference architecture if private AWS object storage satisfies the protected-content contract.

Those products may still be valuable to a customer for ordinary business collaboration, storage, or office-productivity reasons. Their value should not be confused with a Secure Exchange technical dependency.

Consumer/free personal email should not be treated as an approved regulated records-ingress component merely because it can forward messages. If records can land in an environment outside the applicable BAA-controlled boundary before forwarding occurs, the forwarding rule does not cure that boundary.

## Customer configuration, not customer code

A standard new deployment should not require product source changes.

Customer-specific settings should be bounded data/configuration such as:

- organization display name;
- organization logo;
- brand accent values within accessibility constraints;
- secure portal hostname;
- supported records/mail address;
- customer-specific ingress destination identifier;
- staff users/roles/queues;
- retention/disposition duration within approved bounds;
- allowed file categories/types;
- production file/submission size policy within approved bounds;
- downstream filing instructions/profile;
- notification sender/display settings;
- optional enabled/disabled capabilities approved for the deployment;
- vertical terminology/profile where applicable.

Do not store PHI, credentials, recovery secrets, private keys, provider tokens, or customer secrets in the public repository or GitHub workflow inputs/logs.

Production customer configuration should reside in the customer-owned deployment's approved configuration/state/secret mechanisms.

## Near-zero-touch deployment target

After the first production architecture is implemented and validated, repeat customer provisioning should be dominated by account prerequisites and configuration rather than engineering.

The target workflow is:

1. customer creates/owns required vendor/AWS accounts and billing;
2. customer accepts applicable vendor BAAs and retains MFA/recovery ownership;
3. customer grants LDW named/scoped roles where contracted;
4. LDW supplies or enters bounded non-secret deployment configuration;
5. GitHub Actions validates a known Secure Exchange release;
6. GitHub Actions assumes the customer deployment role using short-lived OIDC credentials;
7. infrastructure-as-code creates/updates the standard customer stack;
8. customer configuration is applied through the approved admin/configuration path;
9. synthetic acceptance/smoke tests run;
10. DNS/mail-routing instructions are applied through normal consequential-change approval;
11. production is enabled only after customer authorization.

The long-term operational objective is **zero customer-specific development** and approximately **<= 1-2 hours active LDW labor for a clean supported solo/small-practice deployment**, with the actual AWS application provisioning itself automated to minutes.

This is a target, not a customer quote or current Release 0.14 capability.

## GitHub-to-AWS update model

GitHub should remain LDW's software source of truth and controlled release surface.

A future production deployment should support:

```text
reviewed Secure Exchange release
        -> deterministic validation
        -> signed/identified release artifact
        -> GitHub Actions OIDC
        -> customer-scoped AWS deployment role
        -> infrastructure/application changeset
        -> deploy
        -> synthetic smoke test
        -> health verification
        -> retained rollback path
```

Do not require routine manual Lambda-console edits or permanent AWS access keys in GitHub.

The customer owns the deployed AWS account/resources. LDW retains reusable Secure Exchange framework/IP unless a separate agreement explicitly assigns it.

## Branding model

The preferred UX is **customer-first branded, LDW-powered**.

The normal staff/external workflow should look like the customer's secure records/service portal rather than an AWS, Zoho, Microsoft, Google, or Hushmail product.

Recommended visual hierarchy:

1. customer organization name/logo as the primary identity;
2. configurable customer accent values where accessibility-safe;
3. Secure Exchange workflow layout and interaction model remain standardized;
4. discreet trust attribution such as `Powered by Lowcountry Digital Works` or `Secure Exchange by Lowcountry Digital Works` in the footer/about/system area;
5. provider/infrastructure names remain largely absent from the ordinary staff workflow and appear only where operationally useful to administrators.

The standard product should preserve consistent information architecture and workflow interaction so support/training remain repeatable across customers.

## WHO / WHAT / WHEN UX invariant

The product should make operational accountability understandable without forcing users to read raw audit logs.

### WHO

Examples:

- sender/source;
- last opened by;
- patient/client/matter association confirmed by;
- filed/transferred by.

### WHAT

Examples:

- record/request type;
- attachments and safety state;
- associated patient/client/matter;
- current work state;
- downstream filing/transfer state.

### WHEN

Examples:

- received;
- opened;
- association confirmed;
- downloaded where applicable;
- filed/transferred;
- completed;
- scheduled/actual disposition.

The UI should present these facts as concise workflow evidence, not infer one fact from another.

## Vertical-neutral core and profiles

Dental/Open Dental remains the first concrete reference workflow, but Secure Exchange should not become a dental-specific product fork.

The generic core is applicable to other workflows where sensitive records/documents arrive and must be tracked into an authoritative downstream system, including possible future medical, legal, financial/professional-services, or other regulated/sensitive-document contexts.

Vertical differences should be represented through bounded profiles/adapters where practical, for example:

- dental: patient -> Open Dental filing;
- medical: patient -> EHR/clinical repository workflow;
- legal: client/matter -> matter/document repository;
- other professional services: customer/case/project -> authoritative downstream system.

Do not claim these verticals are implemented or validated merely because the generic model can represent them.

A future profile system may provide controlled terminology such as `Patient`, `Client`, `Matter`, `Case`, or `Record` without changing the underlying authorization, evidence, attachment-safety, retention, and disposition semantics.

## Customer responsibilities

Customer remains responsible for:

- customer-owned accounts, billing, vendor agreements, and recovery authority;
- vendor/customer BAAs where applicable;
- staff access decisions;
- downstream authoritative-system licensing and operation;
- final downstream filing/transfer where the workflow is manual;
- practice/organization retention and preservation policies;
- notifying LDW of staff/access/provider changes where support is contracted.

## LDW responsibilities under an implementation/support engagement

LDW may be responsible for the contracted subset of:

- provider/workflow assessment;
- standard deployment/configuration;
- Secure Exchange application release/patch maintenance during the defined supported period;
- infrastructure-as-code and deployment automation;
- bounded health/security alert handling where support is contracted;
- synthetic troubleshooting and minimized PHI exposure;
- documented changes and rollback procedures;
- provider routing/runbook maintenance.

Do not promise unlimited support, 24x7 monitoring, guaranteed compliance, or guaranteed uptime unless separately contracted.

## Support/update commercial direction

Secure Exchange should not require a recurring LDW hosting subscription merely because the customer owns a deployed instance.

The business/pricing workstream should separately evaluate:

- one-time standardized implementation price;
- an initial stabilization period;
- a defined supported-release period for low-marginal-cost core security/bug fixes where automated deployment makes that commercially sustainable;
- separately billable human troubleshooting, provider migration, user/admin changes, training, workflow changes, major upgrades, and custom integrations;
- optional ongoing maintenance/support where the customer wants proactive human operations.

This document does not set prices.

## Pre-production unresolved gates

Before a real regulated production release, separately validate at minimum:

- exact AWS reference services, BAA coverage, IAM and account-bootstrap model;
- infrastructure-as-code and GitHub OIDC deployment design;
- staff identity/bootstrap/recovery;
- exact mail-routing/redirect patterns for supported providers;
- SES or alternate records-ingress behavior and maximum accepted raw email size;
- parsing/archive/file-expansion safety;
- production file limits and abuse controls around the 500 MB/file + 1 GB/submission planning target;
- direct-to-S3 upload authorization and incomplete-upload cleanup;
- GuardDuty result provenance, fail-closed transitions, and scan costs;
- KMS key policy and whether the customer-managed key remains required;
- log minimization, alerting, incident response, backup/recovery, restore invalidation, and disposition;
- customer admin/configuration UX;
- branding/profile configuration and accessibility;
- support/update policy;
- downstream filing semantics for the first actual deployment;
- contractual/BAA responsibility chain;
- synthetic end-to-end production acceptance testing before PHI.

## Explicit non-authorization

This design direction does not authorize:

- production AWS/account creation or provisioning;
- customer/provider purchase or subscription change;
- DNS/MX/SPF/DKIM/DMARC/mail-routing change;
- BAA acceptance/signature;
- PHI/customer data;
- real provider mail ingestion;
- real downstream integration;
- automatic Open Dental writes;
- production deployment;
- new functional release work.

It records the intended design target so a later authorized production architecture/development gate can implement one repeatable solution rather than rediscovering the deployment model per customer.
