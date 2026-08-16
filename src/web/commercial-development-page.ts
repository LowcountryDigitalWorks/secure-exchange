import type { StaffAttachmentCandidate } from "../application/attachment-service.js";
import type {
  ConversationReadModel,
  QueueCandidate,
} from "../application/conversation-service.js";
import {
  SYNTHETIC_FILING_CLASSIFICATIONS,
  SYNTHETIC_FILING_DESTINATIONS,
  type SyntheticCommercialThreadState,
  type SyntheticDiagnosticCounterKey,
  type SyntheticNotification,
} from "../adapters/synthetic-commercial-workflow.js";
import { escapeHtml, type RoutingChoice } from "./page.js";

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

function warning(): string {
  return `<aside class="notice" aria-label="Synthetic development warning">
    <strong>SYNTHETIC DEVELOPMENT DEMO</strong>
    <p>No real patient, customer, confidential, regulated, or PHI information may be entered. No real downstream provider receives these synthetic records.</p>
  </aside>`;
}

function navigation(): string {
  return `<nav aria-label="Synthetic commercial demo">
    <a href="/demo/commercial">Commercial intake</a>
    <a href="/demo/commercial/staff/queue">Staff queue</a>
    <a href="/demo/commercial/admin/diagnostics">Sanitized diagnostics</a>
    <a href="/demo">Base demo</a>
  </nav>`;
}

function page(title: string, content: string): string {
  return documentPage(title, `${warning()}${navigation()}${content}`);
}

export function renderCommercialIntake(
  routingChoices: readonly RoutingChoice[],
): string {
  const routingOptions = routingChoices
    .map(
      (choice) =>
        `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`,
    )
    .join("");
  return page(
    "Synthetic Commercial Intake — Secure Exchange",
    `<section class="card stack" aria-labelledby="commercial-intake-title">
      <div>
        <h1 id="commercial-intake-title">Synthetic provider-augmented records intake</h1>
        <p>This development workflow demonstrates secure intake, staff review, synthetic patient resolution, filing mapping, simulated downstream transfer, explicit FILED attestation, completion, and disposition.</p>
      </div>
      <form method="post" action="/demo/commercial/intake" enctype="multipart/form-data" class="stack">
        <div class="stack">
          <label for="routingCategory">Routing category</label>
          <select id="routingCategory" name="routingCategory" required>${routingOptions}</select>
        </div>
        <div class="stack">
          <label for="initialMessage">Synthetic message</label>
          <textarea id="initialMessage" name="initialMessage" maxlength="8000" required></textarea>
        </div>
        <fieldset class="stack">
          <legend>Optional sender-supplied matching evidence</legend>
          <p>These values help staff search only. They will not silently change downstream demographics.</p>
          <div class="stack">
            <label for="syntheticName">Synthetic name</label>
            <input id="syntheticName" name="syntheticName" type="text" maxlength="80" autocomplete="off">
          </div>
          <div class="stack">
            <label for="syntheticDob">Synthetic date of birth</label>
            <input id="syntheticDob" name="syntheticDob" type="date">
          </div>
        </fieldset>
        <div class="stack">
          <label for="attachments">Synthetic attachments</label>
          <input id="attachments" name="attachments" type="file" multiple required accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain">
          <small>1–4 files; maximum 2 MiB each. PDF, PNG, JPEG, or plain text only. Files enter QUARANTINED first and are then processed by the clearly labeled synthetic scanner step.</small>
        </div>
        <button type="submit">Submit synthetic records</button>
      </form>
    </section>`,
  );
}

export function renderCommercialSubmitted(): string {
  return page(
    "Synthetic Submission Received — Secure Exchange",
    `<section class="card" aria-labelledby="commercial-submitted-title">
      <h1 id="commercial-submitted-title">Synthetic records received</h1>
      <p>The demo created a generic Secure Exchange thread, ingested each file through the existing quarantine path, and recorded only a local synthetic provider notification: <strong>A secure exchange item is available.</strong></p>
      <p>No email, provider API, Open Dental integration, or real customer system was contacted.</p>
      <a class="button-link" href="/demo/commercial/staff/queue">Open synthetic staff queue</a>
    </section>`,
  );
}

export function renderCommercialQueue(
  candidates: readonly QueueCandidate[],
): string {
  const items = candidates.length === 0
    ? "<p>No synthetic commercial work is queued.</p>"
    : `<ul class="queue-list">${candidates
        .map(
          (candidate) => `<li class="queue-item">
            <h2>${escapeHtml(candidate.routingCategory)}</h2>
            <div class="meta">
              <div><strong>State:</strong> ${escapeHtml(candidate.state)}</div>
              <div><strong>Last activity:</strong> <time datetime="${escapeHtml(candidate.lastActivityAt)}">${escapeHtml(candidate.lastActivityAt)}</time></div>
              <div><strong>Opaque thread:</strong> <code>${escapeHtml(candidate.threadId)}</code></div>
            </div>
            <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(candidate.threadId)}/open">
              <button type="submit">Open synthetic work item</button>
            </form>
          </li>`,
        )
        .join("")}</ul>`;
  return page(
    "Synthetic Commercial Staff Queue — Secure Exchange",
    `<section class="card" aria-labelledby="commercial-queue-title">
      <h1 id="commercial-queue-title">Synthetic commercial staff queue</h1>
      <p>Opening a work item records the existing THREAD_OPENED evidence only. It does not create download, transfer, completion, or disposition evidence.</p>
      ${items}
    </section>`,
  );
}

function patientResolution(state: SyntheticCommercialThreadState): string {
  const evidence =
    state.senderEvidence.syntheticName === undefined &&
    state.senderEvidence.syntheticDateOfBirth === undefined
      ? "<p>No sender-supplied matching evidence was provided.</p>"
      : `<div class="card">
          <h3>SENDER-SUPPLIED MATCHING EVIDENCE</h3>
          <p><strong>Synthetic name:</strong> ${escapeHtml(state.senderEvidence.syntheticName ?? "Not provided")}</p>
          <p><strong>Synthetic DOB:</strong> ${escapeHtml(state.senderEvidence.syntheticDateOfBirth ?? "Not provided")}</p>
          <p><strong>WILL NOT CHANGE:</strong> these hints do not update downstream demographics.</p>
        </div>`;

  const candidates = state.patientCandidates.length === 0
    ? ""
    : `<section class="card" aria-labelledby="candidate-title">
        <h3 id="candidate-title">Synthetic fixture candidates</h3>
        <p>Staff must explicitly select the intended fixture; no candidate is automatically selected.</p>
        <ul class="queue-list">${state.patientCandidates
          .map(
            (patient) => `<li class="queue-item">
              <strong>${escapeHtml(patient.displayName)}</strong>
              <div>Number: <code>${escapeHtml(patient.patientNumber)}</code></div>
              <div>DOB: ${escapeHtml(patient.dateOfBirth)}</div>
              <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(state.threadId)}/patient/select">
                <input type="hidden" name="patientNumber" value="${escapeHtml(patient.patientNumber)}">
                <button type="submit">Confirm this synthetic patient</button>
              </form>
            </li>`,
          )
          .join("")}</ul>
      </section>`;

  const confirmed = state.confirmedPatient === undefined
    ? `<p class="status">Patient resolution: ${escapeHtml(state.patientResolutionStatus)}</p>`
    : `<div class="card">
        <h3>Confirmed synthetic patient</h3>
        <p><strong>${escapeHtml(state.confirmedPatient.displayName)}</strong></p>
        <p>Patient number: <code>${escapeHtml(state.confirmedPatient.patientNumber)}</code></p>
        <p>DOB: ${escapeHtml(state.confirmedPatient.dateOfBirth)}</p>
      </div>`;

  return `<section class="card stack" aria-labelledby="patient-resolution-title">
    <h2 id="patient-resolution-title">Synthetic patient resolution</h2>
    ${evidence}
    ${confirmed}
    <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(state.threadId)}/patient/verify-number" class="stack">
      <label for="patientNumber">Known synthetic patient number</label>
      <input id="patientNumber" name="patientNumber" type="text" maxlength="32" autocomplete="off" required>
      <button type="submit">Verify synthetic number</button>
    </form>
    <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(state.threadId)}/patient/search" class="stack">
      <h3>Search existing synthetic fixtures</h3>
      <label for="searchName">Synthetic name</label>
      <input id="searchName" name="searchName" type="text" maxlength="80" required>
      <label for="searchDob">Synthetic DOB</label>
      <input id="searchDob" name="searchDob" type="date" required>
      <button type="submit">Search fixtures</button>
    </form>
    ${candidates}
    <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(state.threadId)}/patient/not-found">
      <button type="submit">Patient not found / unresolved</button>
    </form>
    <p>No patient-creation path exists in Release 0.14.</p>
  </section>`;
}

function mappingOptions(
  current: string,
  choices: readonly { readonly value: string; readonly label: string }[],
): string {
  return choices
    .map(
      (choice) =>
        `<option value="${escapeHtml(choice.value)}"${choice.value === current ? " selected" : ""}>${escapeHtml(choice.label)}</option>`,
    )
    .join("");
}

function attachmentSection(
  threadId: string,
  candidates: readonly StaffAttachmentCandidate[],
  state: SyntheticCommercialThreadState,
): string {
  if (candidates.length === 0) {
    return `<section class="card"><h2>Attachments</h2><p>No synthetic attachments are available.</p></section>`;
  }
  const items = candidates
    .map((candidate) => {
      const mapping = state.filingMappings.find(
        (item) => item.attachmentId === candidate.attachmentId,
      );
      const previewPath = `/demo/commercial/staff/threads/${encodeURIComponent(threadId)}/preview/${encodeURIComponent(candidate.messageId)}/${encodeURIComponent(candidate.attachmentId)}`;
      const preview = candidate.safetyState !== "CLEAN"
        ? `<p>Preview unavailable until the attachment is exactly CLEAN.</p>`
        : candidate.normalizedMediaType === "image/png" ||
            candidate.normalizedMediaType === "image/jpeg"
          ? `<a href="${previewPath}" target="_blank" rel="noopener noreferrer">Open larger synthetic image preview</a>
             <img class="preview-image" src="${previewPath}" alt="Synthetic attachment preview">`
          : candidate.normalizedMediaType === "application/pdf"
            ? `<a class="button-link" href="${previewPath}" target="_blank" rel="noopener noreferrer">Open synthetic PDF preview in new tab</a>`
            : `<p>Inline preview is not provided for this type. Use the explicit manual-download fallback.</p>`;
      const mappingForm = mapping === undefined
        ? "<p>No synthetic filing mapping is available.</p>"
        : `<div class="card stack">
            <h4>Proposed synthetic filing mapping</h4>
            <p><strong>Description:</strong> ${escapeHtml(mapping.description)}</p>
            ${mapping.syntheticLocationMetadata === undefined ? "" : `<p><strong>Fixture location metadata:</strong> ${escapeHtml(mapping.syntheticLocationMetadata)}</p>`}
            <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(threadId)}/mapping" class="stack">
              <input type="hidden" name="attachmentId" value="${escapeHtml(candidate.attachmentId)}">
              <label>Destination/category
                <select name="destination" required>${mappingOptions(mapping.destination, SYNTHETIC_FILING_DESTINATIONS)}</select>
              </label>
              <label>Classification
                <select name="classification" required>${mappingOptions(mapping.classification, SYNTHETIC_FILING_CLASSIFICATIONS)}</select>
              </label>
              <button type="submit">Save / confirm mapping</button>
            </form>
          </div>`;
      return `<li class="queue-item stack">
        <h3>${escapeHtml(candidate.safeDownloadFilename)}</h3>
        <div class="meta">
          <div><strong>Type:</strong> ${escapeHtml(candidate.normalizedMediaType)}</div>
          <div><strong>Category:</strong> ${escapeHtml(candidate.normalizedMediaCategory)}</div>
          <div><strong>Bytes:</strong> ${candidate.byteLength}</div>
          <div><strong>Safety:</strong> ${escapeHtml(candidate.safetyState)}</div>
        </div>
        ${preview}
        <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(threadId)}/download">
          <input type="hidden" name="messageId" value="${escapeHtml(candidate.messageId)}">
          <input type="hidden" name="attachmentId" value="${escapeHtml(candidate.attachmentId)}">
          <button type="submit">Manual download fallback</button>
        </form>
        ${mappingForm}
      </li>`;
    })
    .join("");
  return `<section class="card stack" aria-labelledby="attachment-title">
    <h2 id="attachment-title">Safe attachment review and filing preview</h2>
    <p><strong>WILL CHANGE:</strong> only the explicitly confirmed synthetic destination/category and classification shown below.</p>
    <p><strong>WILL NOT CHANGE:</strong> downstream patient demographics, sender-supplied DOB, or immutable uploaded source bytes.</p>
    <ul class="queue-list">${items}</ul>
  </section>`;
}

function downstreamSection(
  conversation: ConversationReadModel,
  state: SyntheticCommercialThreadState,
): string {
  const thread = conversation.thread;
  const simulation = state.simulatedTransferOutcome === undefined
    ? "Not run"
    : `SIMULATED / SYNTHETIC ${state.simulatedTransferOutcome}`;
  const filing = state.filedAttestationId === undefined
    ? "No qualifying FILED attestation has been explicitly confirmed."
    : `Existing FILED TransferAttestation recorded: ${escapeHtml(state.filedAttestationId)}`;
  const canSimulate = state.confirmedPatient !== undefined;
  const canConfirm =
    state.simulatedTransferOutcome === "SUCCESS" &&
    state.filedAttestationId === undefined &&
    !state.filingConfirmationPending;
  const canComplete = thread.state !== "COMPLETED" && thread.state !== "DISPOSED";
  const canDispose = thread.state === "COMPLETED";

  return `<section class="card stack" aria-labelledby="downstream-title">
    <h2 id="downstream-title">Synthetic downstream transfer and workflow evidence</h2>
    <p><strong>Simulation status:</strong> ${escapeHtml(simulation)}</p>
    <p>${filing}</p>
    <p>No real Open Dental or other provider receives this data. A simulated success is demo state only and never creates FILED evidence automatically.</p>
    ${canSimulate ? `<div class="actions">
      <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(thread.threadId)}/simulate">
        <input type="hidden" name="outcome" value="FAILURE">
        <button type="submit">SIMULATED FAILURE</button>
      </form>
      <form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(thread.threadId)}/simulate">
        <input type="hidden" name="outcome" value="SUCCESS">
        <button type="submit">SIMULATED SUCCESS / RETRY</button>
      </form>
    </div>` : `<p>Downstream simulation is blocked until a synthetic patient fixture is explicitly confirmed.</p>`}
    ${canConfirm ? `<form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(thread.threadId)}/confirm-filing">
      <button type="submit">Confirm simulated filing</button>
    </form>` : ""}
    ${canComplete ? `<form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(thread.threadId)}/complete">
      <input type="hidden" name="expectedVersion" value="${thread.version}">
      <button type="submit">Complete exchange</button>
    </form>` : ""}
    ${canDispose ? `<form method="post" action="/demo/commercial/staff/threads/${encodeURIComponent(thread.threadId)}/dispose">
      <input type="hidden" name="expectedVersion" value="${thread.version}">
      <button type="submit">Dispose temporary exchange</button>
    </form>` : ""}
    <p><strong>Current lifecycle:</strong> ${escapeHtml(thread.state)}</p>
  </section>`;
}

export function renderCommercialThread(
  conversation: ConversationReadModel,
  candidates: readonly StaffAttachmentCandidate[],
  state: SyntheticCommercialThreadState,
): string {
  return page(
    "Synthetic Commercial Work Item — Secure Exchange",
    `<section class="card" aria-labelledby="work-item-title">
      <h1 id="work-item-title">Synthetic commercial work item</h1>
      <p>Opaque thread: <code>${escapeHtml(conversation.thread.threadId)}</code></p>
      <p>Lifecycle: <strong>${escapeHtml(conversation.thread.state)}</strong></p>
    </section>
    ${patientResolution(state)}
    ${attachmentSection(conversation.thread.threadId, candidates, state)}
    ${downstreamSection(conversation, state)}`,
  );
}

export function renderCommercialDiagnostics(
  diagnostics: Readonly<Record<SyntheticDiagnosticCounterKey, number>>,
  notifications: readonly SyntheticNotification[],
): string {
  const rows = Object.entries(diagnostics)
    .map(
      ([key, value]) =>
        `<tr><th scope="row"><code>${escapeHtml(key)}</code></th><td>${value}</td></tr>`,
    )
    .join("");
  const notices = notifications.length === 0
    ? "<p>No synthetic notifications have been recorded.</p>"
    : `<ul>${notifications
        .map((notification) => `<li>${escapeHtml(notification.message)}</li>`)
        .join("")}</ul>`;
  return page(
    "Sanitized Synthetic Diagnostics — Secure Exchange",
    `<section class="card stack" aria-labelledby="diagnostics-title">
      <h1 id="diagnostics-title">Sanitized local diagnostics</h1>
      <p>Fixed aggregate counters only. No patient name, DOB, patient number, filename, message body, bytes, credential, token, bearer, verifier, or outbound telemetry is stored here.</p>
      <table>
        <caption>Release 0.14 synthetic counters</caption>
        <tbody>${rows}</tbody>
      </table>
      <h2>Synthetic provider-notification representation</h2>
      ${notices}
      <p>No email or provider API was contacted.</p>
    </section>`,
  );
}

export function renderCommercialError(
  title: string,
  message: string,
  backHref: string,
): string {
  return page(
    `${title} — Synthetic Commercial Demo`,
    `<section class="card" role="alert">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="button-link" href="${escapeHtml(backHref)}">Return to synthetic workflow</a>
    </section>`,
  );
}
