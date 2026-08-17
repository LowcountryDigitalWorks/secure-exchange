import type { ExternalConversationProjection } from "../application/access-grant-service.js";
import type {
  ConversationReadModel,
  QueueCandidate,
} from "../application/conversation-service.js";
import type { ExternalAttachmentCandidate } from "../application/external-attachment-retrieval-service.js";
import type { EngineeringStatus } from "../application/status.js";

export const shellStyles = `
:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: Canvas;
  color: CanvasText;
}

main {
  width: min(58rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}

a {
  color: LinkText;
}

.card,
.notice,
.message,
.queue-item {
  border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.notice {
  margin-bottom: 1.5rem;
  border-width: 2px;
}

.status,
.direction {
  font-weight: 700;
}

.actions,
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.stack {
  display: grid;
  gap: 1rem;
}

label {
  font-weight: 650;
}

input,
select,
textarea,
button {
  font: inherit;
}

input[type="text"],
input[type="password"],
select,
textarea {
  width: 100%;
  padding: 0.7rem;
}

textarea {
  min-height: 8rem;
  resize: vertical;
}

button,
.button-link {
  display: inline-block;
  padding: 0.65rem 0.9rem;
  border: 1px solid ButtonBorder;
  border-radius: 0.5rem;
  background: ButtonFace;
  color: ButtonText;
  text-decoration: none;
  cursor: pointer;
}

.queue-list,
.message-list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.message-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.5rem 1rem;
}

code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  overflow-wrap: anywhere;
}

.preview-image {
  display: block;
  width: min(100%, 44rem);
  height: auto;
  max-height: 36rem;
  object-fit: contain;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.5rem;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

@media (max-width: 38rem) {
  main {
    width: min(100% - 1rem, 58rem);
    padding-top: 1rem;
  }

  .card,
  .notice,
  .message,
  .queue-item {
    padding: 1rem;
  }
}
`;

export interface RoutingChoice {
  readonly value: string;
  readonly label: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function documentPage(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;
}

function developmentNotice(): string {
  return `<aside class="notice" aria-label="Development data warning">
    <strong>Synthetic Development Demo</strong>
    <p>Use synthetic data only. Do not enter real customer, patient, client, confidential, regulated, or PHI data.</p>
  </aside>`;
}

function demoNav(): string {
  return `<nav aria-label="Synthetic development demo">
    <a href="/demo">Demo home</a>
    <a href="/demo/external">External form</a>
    <a href="/demo/staff/queue">Staff queue</a>
  </nav>`;
}

export function renderEngineeringShell(
  status: EngineeringStatus,
  demoEnabled: boolean,
): string {
  const demoMessage = demoEnabled
    ? `<p><strong>Synthetic Development Demo is enabled for this local process.</strong></p>
       <p><a href="/demo">Open the synthetic development demo</a></p>`
    : `<p><strong>Synthetic Development Demo is disabled.</strong> Set the documented development-only configuration flag to enable local workflow routes.</p>`;

  return documentPage(
    "Secure Exchange Local Development Vertical Slice",
    `<article class="card" aria-labelledby="page-title">
      <h1 id="page-title">Secure Exchange</h1>
      <p>Provider-neutral workflow and conversation core with a disabled-by-default local browser adapter. Production services are not implemented.</p>
      <p class="status">Status: ${escapeHtml(status.status)}</p>
      <p>Baseline: <code>${escapeHtml(status.baseline)}</code></p>
      ${demoMessage}
    </article>`,
  );
}

export function renderDevelopmentLanding(): string {
  return documentPage(
    "Synthetic Development Demo — Secure Exchange",
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="demo-title">
      <h1 id="demo-title">Synthetic Development Demo</h1>
      <p>This local-only vertical slice exercises accountless synthetic initiation, a server-owned staff context, authorized queue access, chronological conversation reads, explicit workflow actions, and staff replies.</p>
      <div class="actions">
        <a class="button-link" href="/demo/external">Start synthetic external exchange</a>
        <a class="button-link" href="/demo/staff/queue">Open synthetic staff queue</a>
      </div>
    </section>`,
  );
}

export function renderExternalForm(
  routingChoices: readonly RoutingChoice[],
): string {
  const options = routingChoices
    .map(
      (choice) =>
        `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`,
    )
    .join("");

  return documentPage(
    "External Form — Synthetic Development Demo",
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="external-title">
      <h1 id="external-title">External synthetic exchange</h1>
      <p>No account is created. Authoritative identifiers and the external audit reference are generated by the server.</p>
      <form method="post" action="/demo/external" class="stack">
        <div class="stack">
          <label for="routingCategory">Routing category</label>
          <select id="routingCategory" name="routingCategory" required>${options}</select>
        </div>
        <div class="stack">
          <label for="initialMessage">Synthetic message</label>
          <textarea id="initialMessage" name="initialMessage" maxlength="8000" required aria-describedby="message-help"></textarea>
          <small id="message-help">Synthetic content only. Do not enter real customer, patient, client, confidential, regulated, or PHI data.</small>
        </div>
        <button type="submit">Submit synthetic exchange</button>
      </form>
    </section>`,
  );
}

export function renderExternalConfirmation(): string {
  return documentPage(
    "Submission Confirmed — Synthetic Development Demo",
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="confirmation-title">
      <h1 id="confirmation-title">Synthetic submission received</h1>
      <p>The local development process created the exchange. This confirmation does not grant external access to the staff conversation.</p>
      <a class="button-link" href="/demo/staff/queue">Open synthetic staff queue</a>
    </section>`,
  );
}

export function renderStaffQueue(
  candidates: readonly QueueCandidate[],
  queueLabel: string,
  staffContextLabel: string,
): string {
  const items =
    candidates.length === 0
      ? "<p>No synthetic work is currently queued.</p>"
      : `<ul class="queue-list">${candidates
          .map((candidate) => {
            const attention =
              candidate.attentionAt === undefined
                ? "Not set"
                : `<time datetime="${escapeHtml(candidate.attentionAt)}">${escapeHtml(candidate.attentionAt)}</time>`;
            return `<li class="queue-item">
              <h2>${escapeHtml(candidate.routingCategory)}</h2>
              <div class="meta">
                <div><strong>State:</strong> ${escapeHtml(candidate.state)}</div>
                <div><strong>Last activity:</strong> <time datetime="${escapeHtml(candidate.lastActivityAt)}">${escapeHtml(candidate.lastActivityAt)}</time></div>
                <div><strong>Attention:</strong> ${attention}</div>
                <div><strong>Thread reference:</strong> <code>${escapeHtml(candidate.threadId)}</code></div>
              </div>
              <form method="post" action="/demo/staff/threads/${encodeURIComponent(candidate.threadId)}/open">
                <button type="submit">Open conversation</button>
              </form>
            </li>`;
          })
          .join("")}</ul>`;

  return documentPage(
    "Staff Queue — Synthetic Development Demo",
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="queue-title">
      <h1 id="queue-title">${escapeHtml(queueLabel)}</h1>
      <p><strong>Identity:</strong> ${escapeHtml(staffContextLabel)}. This is a trusted server-side development fixture, not a login session.</p>
      ${items}
    </section>`,
  );
}

export function renderConversation(
  conversation: ConversationReadModel,
  staffContextLabel: string,
  replyAllowed: boolean,
): string {
  const { thread } = conversation;
  const messages = conversation.messages
    .map((message) => {
      const direction =
        message.direction === "EXTERNAL_TO_STAFF"
          ? "External → Staff"
          : "Staff → External";
      return `<li>
        <article class="message">
          <p class="direction">${direction}</p>
          <p><time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(message.createdAt)}</time></p>
          <p class="message-body">${escapeHtml(message.body.text)}</p>
        </article>
      </li>`;
    })
    .join("");

  const startWork =
    thread.state === "NEW"
      ? `<form method="post" action="/demo/staff/threads/${encodeURIComponent(thread.threadId)}/start" class="actions">
          <input type="hidden" name="expectedVersion" value="${thread.version}">
          <button type="submit">Start work</button>
        </form>`
      : "";

  const reply = replyAllowed
    ? `<section class="card" aria-labelledby="reply-title">
        <h2 id="reply-title">Staff reply</h2>
        <form method="post" action="/demo/staff/threads/${encodeURIComponent(thread.threadId)}/reply" class="stack">
          <input type="hidden" name="expectedVersion" value="${thread.version}">
          <div class="stack">
            <label for="messageBody">Synthetic reply</label>
            <textarea id="messageBody" name="messageBody" maxlength="8000" required></textarea>
          </div>
          <button type="submit">Send synthetic staff reply</button>
        </form>
      </section>`
    : `<section class="card" aria-labelledby="reply-title">
        <h2 id="reply-title">Staff reply</h2>
        <p>Replies are not permitted while this thread is ${escapeHtml(thread.state)}.</p>
      </section>`;

  return documentPage(
    "Conversation — Synthetic Development Demo",
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="conversation-title">
      <h1 id="conversation-title">Conversation</h1>
      <p><strong>Identity:</strong> ${escapeHtml(staffContextLabel)}.</p>
      <div class="meta">
        <div><strong>Routing:</strong> ${escapeHtml(thread.routingCategory)}</div>
        <div><strong>State:</strong> ${escapeHtml(thread.state)}</div>
        <div><strong>Version:</strong> ${thread.version}</div>
        <div><strong>Thread reference:</strong> <code>${escapeHtml(thread.threadId)}</code></div>
      </div>
      ${startWork}
      <h2>Messages</h2>
      <ol class="message-list">${messages}</ol>
    </section>
    ${reply}`,
  );
}

export function renderDemoError(
  title: string,
  message: string,
  backHref: string,
): string {
  return documentPage(
    `${title} — Synthetic Development Demo`,
    `${developmentNotice()}
    ${demoNav()}
    <section class="card" aria-labelledby="error-title">
      <h1 id="error-title">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="${escapeHtml(backHref)}">Return</a>
    </section>`,
  );
}

function externalAccessNav(): string {
  return `<nav aria-label="Synthetic external secure access">
    <a href="/demo/external/access/session">Access home</a>
    <a href="/demo/external/access/conversation">Conversation</a>
    <a href="/demo/external/access/attachments">Attachments</a>
  </nav>`;
}

export function renderExternalAccessForm(): string {
  return documentPage(
    "Secure Access — Synthetic Development Demo",
    `${developmentNotice()}
    <section class="card" aria-labelledby="access-title">
      <h1 id="access-title">Synthetic secure access</h1>
      <p>This disabled-by-default development surface accepts an already-issued AccessGrant. The bearer secret is submitted only by same-origin POST and is not placed in a URL.</p>
      <form method="post" action="/demo/external/access" class="stack" autocomplete="off">
        <div class="stack">
          <label for="threadId">Thread reference</label>
          <input id="threadId" name="threadId" type="text" maxlength="256" required>
        </div>
        <div class="stack">
          <label for="grantId">Grant reference</label>
          <input id="grantId" name="grantId" type="text" maxlength="256" required>
        </div>
        <div class="stack">
          <label for="accessSecret">Access secret</label>
          <input id="accessSecret" name="accessSecret" type="password" maxlength="512" required>
        </div>
        <button type="submit">Continue secure access</button>
      </form>
    </section>`,
  );
}

export function renderExternalAccessSession(): string {
  return documentPage(
    "Secure Access — Synthetic Development Demo",
    `${developmentNotice()}
    ${externalAccessNav()}
    <section class="card" aria-labelledby="session-title">
      <h1 id="session-title">Synthetic secure access</h1>
      <p>The browser capability is short-lived transport only. Each protected action revalidates the authoritative AccessGrant and its specific operation.</p>
      <div class="actions">
        <a class="button-link" href="/demo/external/access/conversation">Read conversation</a>
        <a class="button-link" href="/demo/external/access/attachments">View eligible attachments</a>
      </div>
      <form method="post" action="/demo/external/access/end" class="actions">
        <button type="submit">End secure access</button>
      </form>
    </section>`,
  );
}

export function renderExternalConversationPage(
  conversation: ExternalConversationProjection,
): string {
  const messages = conversation.messages
    .map((message) => {
      const direction =
        message.direction === "EXTERNAL_TO_STAFF"
          ? "You → Staff"
          : "Staff → You";
      return `<li>
        <article class="message">
          <p class="direction">${direction}</p>
          <p><time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(message.createdAt)}</time></p>
          <p class="message-body">${escapeHtml(message.body.text)}</p>
        </article>
      </li>`;
    })
    .join("");

  return documentPage(
    "Conversation — Synthetic Secure Access",
    `${developmentNotice()}
    ${externalAccessNav()}
    <section class="card" aria-labelledby="external-conversation-title">
      <h1 id="external-conversation-title">Conversation</h1>
      <p>This projection intentionally excludes internal message, actor, queue, routing, workflow, audit, and grant metadata.</p>
      <ol class="message-list">${messages}</ol>
    </section>`,
  );
}

export function renderExternalAttachmentCandidates(
  candidates: readonly ExternalAttachmentCandidate[],
): string {
  const content =
    candidates.length === 0
      ? "<p>No eligible attachments are currently available.</p>"
      : `<ul class="queue-list">${candidates
          .map(
            (candidate) => `<li class="queue-item">
              <h2>${escapeHtml(candidate.safeDownloadFilename)}</h2>
              <div class="meta">
                <div><strong>Media type:</strong> ${escapeHtml(candidate.normalizedMediaType)}</div>
                <div><strong>Size:</strong> ${candidate.byteLength} bytes</div>
              </div>
              <form method="post" action="/demo/external/access/download">
                <input type="hidden" name="messageId" value="${escapeHtml(candidate.messageId)}">
                <input type="hidden" name="attachmentId" value="${escapeHtml(candidate.attachmentId)}">
                <button type="submit">Download attachment</button>
              </form>
            </li>`,
          )
          .join("")}</ul>`;

  return documentPage(
    "Attachments — Synthetic Secure Access",
    `${developmentNotice()}
    ${externalAccessNav()}
    <section class="card" aria-labelledby="external-attachments-title">
      <h1 id="external-attachments-title">Eligible attachments</h1>
      <p>Candidate metadata is not download authority. Every download revalidates AccessGrant scope and the authoritative attachment safety path.</p>
      ${content}
    </section>`,
  );
}

export function renderExternalAccessUnavailable(): string {
  return documentPage(
    "Secure Access Unavailable — Synthetic Development Demo",
    `${developmentNotice()}
    <section class="card" aria-labelledby="unavailable-title">
      <h1 id="unavailable-title">Secure access is unavailable</h1>
      <p>The presented synthetic secure-access authority cannot be used.</p>
      <a href="/demo/external/access">Return to secure access</a>
    </section>`,
  );
}
