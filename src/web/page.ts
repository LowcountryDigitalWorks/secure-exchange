import type { EngineeringStatus } from "../application/status.js";

export const shellStyles = `
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
}

body {
  margin: 0;
  min-height: 100vh;
  background: Canvas;
  color: CanvasText;
}

main {
  width: min(44rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 4rem 0;
}

.card {
  border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.status {
  font-weight: 700;
}

code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
`;

export function renderEngineeringShell(status: EngineeringStatus): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Secure Exchange Conversation & Queue Core Prototype</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main>
      <article class="card" aria-labelledby="page-title">
        <h1 id="page-title">Secure Exchange</h1>
        <p>Conversation and queue core prototype only. Public exchange UI and production services are not implemented.</p>
        <p class="status">Status: ${status.status}</p>
        <p>Baseline: <code>${status.baseline}</code></p>
      </article>
    </main>
  </body>
</html>`;
}
