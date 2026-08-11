# ADR-0003 — Initial Implementation Stack

- Status: **Accepted**
- Date: 2026-08-11

## Context

The product needs strong type safety, maintainability, AWS support, accessible responsive UX, automated testing, low operational cost, portability, and effective development through normal ChatGPT web/GitHub workflows.

A large frontend framework should not be adopted without a demonstrated need.

## Decision

Use:

- strict TypeScript as the primary implementation language;
- Node.js 24 as the initial server runtime;
- a thin Hono-style Web-standards-oriented HTTP layer;
- semantic HTML/CSS with small TypeScript modules for the initial frontend.

The domain and business rules remain independent of Hono, Lambda, API Gateway, browser presentation, and provider SDKs.

Expected engineering tooling when code begins:

- npm with committed lockfile;
- TypeScript compiler with strict options;
- small build/bundling tooling;
- Vitest;
- Playwright;
- axe-core.

Release 0.1 adds none of these dependencies.

## Alternatives

### Python/FastAPI

Strong API ecosystem, but would create a second implementation language/type-contract boundary with the browser.

### Java or .NET

Strong typing and mature ecosystems, but more runtime/build ceremony than the initial serverless product requires.

### React/Preact

Credible if the staff dashboard develops complex client-side state and component requirements. Deferred until demonstrated.

### Next.js or similar full-stack framework

Provides substantial convenience but introduces a much larger framework/application-hosting surface than current requirements justify.

### No HTTP framework

Minimizes dependencies but creates unnecessary custom routing/middleware work. A thin standards-oriented layer is the preferred compromise.

## Revisit criteria

A frontend framework may be introduced if measurable UI complexity, state management, component reuse, or maintainability benefits justify the dependency.

A runtime/language change requires an ADR and must preserve provider-neutral domain boundaries.
