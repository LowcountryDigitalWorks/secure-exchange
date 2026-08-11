# ADR-0001 — Customer-Owned Isolated Deployments

- Status: **Accepted**
- Date: 2026-08-11

## Context

Lowcountry Digital Works intends Secure Exchange to be a portable product for small professional customers, including potentially regulated environments.

Customer ownership, clear handoff, reduced cross-customer blast radius, and simple data-custody boundaries are priorities.

## Decision

The preferred production ownership model is one isolated Secure Exchange deployment per customer in customer-owned infrastructure.

The product remains deployment-aware internally through a `deploymentId`/deployment context, but the AWS-first reference architecture does not require a shared cross-customer application data plane.

Donovan Family Dentistry is a likely first healthcare pilot/reference customer, not a separate fork.

## Consequences

Benefits:

- simpler customer data ownership;
- clearer operational handoff;
- reduced cross-customer blast radius;
- easier customer-specific vendor/contractual boundary;
- easier eventual transition away from LDW administration.

Costs:

- duplicated infrastructure per customer;
- more deployment automation/configuration required;
- updates must be safely rolled across multiple isolated installations.

## Portability

This ADR defines the preferred ownership/deployment model, not an AWS-only requirement.

Alternative infrastructure implementations must preserve the approved customer-owned isolation model unless the orchestrator approves a change.
