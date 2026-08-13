import { MAX_MESSAGE_BODY_LENGTH } from "../domain/message.js";
import type { AccessGrantOperation } from "../domain/index.js";

const ACCESS_PREFIX = "/demo/external/access";

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function notice(): string {
  return `<aside class="notice" aria-label="Development data warning">
    <strong>Synthetic Development Demo</strong>
    <p>Use synthetic data only. Do not enter real customer, patient, client, confidential, regulated, or PHI data.</p>
  </aside>`;
}

function nav(operations: readonly AccessGrantOperation[]): string {
  const links = [`<a href="${ACCESS_PREFIX}/session">Access home</a>`];
  if (operations.includes("THREAD_READ"))
    links.push(`<a href="${ACCESS_PREFIX}/conversation">Conversation</a>`);
  if (operations.includes("ATTACHMENT_READ"))
    links.push(`<a href="${ACCESS_PREFIX}/attachments">Attachments</a>`);
  if (operations.includes("THREAD_REPLY"))
    links.push(`<a href="${ACCESS_PREFIX}/reply">Reply</a>`);
  return `<nav aria-label="Synthetic external secure access">${links.join("\n")}</nav>`;
}

export function renderExternalDevelopmentSession(
  operations: readonly AccessGrantOperation[],
): string {
  const actions: string[] = [];
  if (operations.includes("THREAD_READ"))
    actions.push(
      `<a class="button-link" href="${ACCESS_PREFIX}/conversation">Read conversation</a>`,
    );
  if (operations.includes("ATTACHMENT_READ"))
    actions.push(
      `<a class="button-link" href="${ACCESS_PREFIX}/attachments">View eligible attachments</a>`,
    );
  if (operations.includes("THREAD_REPLY"))
    actions.push(
      `<a class="button-link" href="${ACCESS_PREFIX}/reply">Send reply</a>`,
    );
  return page(
    "Secure Access — Synthetic Development Demo",
    `${notice()}${nav(operations)}<section class="card" aria-labelledby="session-title"><h1 id="session-title">Synthetic secure access</h1><p>The browser capability is short-lived transport only. Each protected action revalidates the authoritative AccessGrant and its exact operation.</p><div class="actions">${actions.join("\n")}</div><form method="post" action="${ACCESS_PREFIX}/end" class="actions"><button type="submit">End secure access</button></form></section>`,
  );
}

export function renderExternalReplyForm(): string {
  return page(
    "Reply — Synthetic Secure Access",
    `${notice()}<nav aria-label="Synthetic external secure access"><a href="${ACCESS_PREFIX}/session">Access home</a></nav><section class="card" aria-labelledby="external-reply-title"><h1 id="external-reply-title">Synthetic reply</h1><p>The server revalidates current reply authority and lifecycle when this form is submitted. This page is not authorization proof.</p><form method="post" action="${ACCESS_PREFIX}/reply" class="stack"><div class="stack"><label for="messageBody">Synthetic plain-text reply</label><textarea id="messageBody" name="messageBody" maxlength="${MAX_MESSAGE_BODY_LENGTH}" required aria-describedby="reply-help"></textarea><small id="reply-help">Synthetic content only. Empty, oversized, or unsafe control-character content is rejected by the authoritative message boundary.</small></div><button type="submit">Send synthetic reply</button></form></section>`,
  );
}

export function renderExternalReplyInvalid(): string {
  return page(
    "Reply Not Accepted — Synthetic Secure Access",
    `${notice()}<section class="card" aria-labelledby="reply-invalid-title"><h1 id="reply-invalid-title">Reply not accepted</h1><p>The synthetic reply must be bounded non-empty plain text without unsafe control characters.</p><a href="${ACCESS_PREFIX}/reply">Return to reply</a></section>`,
  );
}

export function renderExternalReplySubmitted(): string {
  return page(
    "Reply Submitted — Synthetic Secure Access",
    `${notice()}<section class="card" aria-labelledby="reply-submitted-title"><h1 id="reply-submitted-title">Synthetic reply submitted</h1><p>The authoritative application accepted the reply. No lifecycle transition, opened evidence, download evidence, transfer attestation, or completion is inferred from this action.</p><a class="button-link" href="${ACCESS_PREFIX}/session">Return to secure access</a></section>`,
  );
}
