# ADR-0002 — AWS-First Reference Architecture

- Status: **Accepted**
- Date: 2026-08-11

## Context

Secure Exchange needs strong security controls, low idle operating cost, managed commodity primitives, and an architecture that Lowcountry Digital Works can operate and hand off without rebuilding common infrastructure services.

## Decision

Use AWS as the initial reference deployment architecture while keeping the application core provider-neutral.

Approved reference components:

- Amazon Cognito — initial staff identity adapter;
- Amazon SES — notification adapter;
- Amazon S3 — protected object storage;
- AWS Lambda and API Gateway — application/API execution where appropriate;
- AWS KMS-backed controls — encryption/key management;
- GuardDuty Malware Protection for S3 — malware-scanning adapter;
- CloudTrail and CloudWatch — infrastructure/security telemetry;
- DynamoDB — state-store adapter per ADR-0004;
- Secure Exchange application audit events — workflow/security evidence.

Release 0.1 provisions none of these resources.

## Boundary

Secure Exchange owns domain semantics, workflow, application authorization policy, queues, lifecycle, audit semantics, configuration, retention/disposition orchestration, and UX.

AWS components supply commodity infrastructure capabilities.

## Consequences

Benefits:

- managed primitives;
- usage-oriented/serverless options;
- strong AWS-native security integrations;
- customer-owned account deployment;
- low application-operations burden.

Risks:

- AWS-specific adapter work;
- provider IAM/configuration complexity;
- risk of accidental lock-in if SDK types leak into the core.

Mitigation:

- provider-neutral ports;
- adapter isolation;
- documented replacement paths;
- no AWS SDK types in domain contracts.

## Cost

Release 0.1 recurring infrastructure cost: **$0**.

Future production costs are usage/configuration dependent and require customer-specific modeling before provisioning.
