import { describe, expect, it } from "vitest";

import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { SYNTHETIC_PATIENT_RECORD_DESTINATION } from "../../src/adapters/synthetic-commercial-workflow.js";
import { createApp } from "../../src/http/app.js";
import { createLocalDevelopmentDemoRuntime } from "../../src/http/development-demo.js";

const ORIGIN = "http://localhost";

class DeterministicIdGenerator implements OpaqueIdGenerator {
  private sequence = 0;

  generate(purpose: OpaqueIdPurpose): string {
    this.sequence += 1;
    return `${purpose}-${this.sequence}`;
  }
}

function createFixture() {
  let tick = 0;
  const runtime = createLocalDevelopmentDemoRuntime({
    idGenerator: new DeterministicIdGenerator(),
    now: () => {
      const value = new Date(Date.UTC(2026, 7, 15, 18, 0, tick));
      tick += 1;
      return value.toISOString();
    },
  });
  return {
    runtime,
    app: createApp({ demo: runtime, commercialWorkflowEnabled: true }),
  };
}

function syntheticFile(
  name = "synthetic-record.pdf",
  type = "application/pdf",
  content: Uint8Array = new TextEncoder().encode("synthetic file bytes"),
): File {
  return new File([content], name, { type });
}

async function postForm(
  app: ReturnType<typeof createApp>,
  path: string,
  fields: Readonly<Record<string, string>>,
  origin = ORIGIN,
): Promise<Response> {
  return app.request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function submitIntake(
  fixture: ReturnType<typeof createFixture>,
  files: readonly File[] = [syntheticFile()],
): Promise<string> {
  const form = new FormData();
  form.set("routingCategory", "RECORDS");
  form.set("initialMessage", "Synthetic provider records intake.");
  form.set("syntheticName", "Synthetic Avery Example");
  form.set("syntheticDob", "1985-01-02");
  for (const file of files) {
    form.append("attachments", file);
  }
  const response = await fixture.app.request(
    `${ORIGIN}/demo/commercial/intake`,
    { method: "POST", headers: { Origin: ORIGIN }, body: form },
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/demo/commercial/submitted");

  const threads = await fixture.runtime.store.listThreadsForQueue(
    fixture.runtime.deploymentId,
    fixture.runtime.queueId,
  );
  expect(threads).toHaveLength(1);
  return threads[0]?.threadId ?? "";
}

async function candidates(
  fixture: ReturnType<typeof createFixture>,
  threadId: string,
) {
  return fixture.runtime.attachmentService.listStaffAttachmentCandidates({
    actor: fixture.runtime.staffActor,
    deploymentId: fixture.runtime.deploymentId,
    threadId,
  });
}

async function seedQuarantinedCommercialThread(
  fixture: ReturnType<typeof createFixture>,
): Promise<{
  readonly threadId: string;
  readonly messageId: string;
  readonly attachmentId: string;
}> {
  const threadId = fixture.runtime.idGenerator.generate("thread");
  const messageId = fixture.runtime.idGenerator.generate("message");
  await fixture.runtime.conversationService.initiateExternalExchange({
    deploymentId: fixture.runtime.deploymentId,
    queueId: fixture.runtime.queueId,
    routingCategory: "RECORDS",
    threadId,
    externalParticipantRef:
      fixture.runtime.idGenerator.generate("external-participant"),
    messageId,
    initialMessage: "Synthetic quarantined preview fixture.",
    threadCreatedAuditEventId: fixture.runtime.idGenerator.generate("audit"),
    messageAuditEventId: fixture.runtime.idGenerator.generate("audit"),
    at: fixture.runtime.now(),
  });
  const attachment = await fixture.runtime.attachmentService.ingestAttachment({
    deploymentId: fixture.runtime.deploymentId,
    threadId,
    messageId,
    originalDisplayFilename: "quarantined.pdf",
    declaredMediaCategory: "DOCUMENT",
    declaredMediaType: "application/pdf",
    content: new TextEncoder().encode("synthetic quarantined bytes"),
    at: fixture.runtime.now(),
  });
  const boundedCandidates = await candidates(fixture, threadId);
  fixture.runtime.commercialWorkflow.registerIntake(threadId, {}, boundedCandidates);
  return { threadId, messageId, attachmentId: attachment.attachmentId };
}

describe("Release 0.14 synthetic commercial development HTTP", () => {
  it("requires both commercial gates and leaves existing external-retrieval gating independent", async () => {
    const runtime = createLocalDevelopmentDemoRuntime();
    const disabled = createApp();
    expect((await disabled.request(`${ORIGIN}/demo/commercial`)).status).toBe(404);

    const masterOnly = createApp({ demo: runtime });
    expect((await masterOnly.request(`${ORIGIN}/demo/commercial`)).status).toBe(404);

    const commercial = createApp({
      demo: runtime,
      commercialWorkflowEnabled: true,
    });
    const commercialResponse = await commercial.request(
      `${ORIGIN}/demo/commercial`,
    );
    expect(commercialResponse.status).toBe(200);
    expect(await commercialResponse.text()).toContain(
      "SYNTHETIC DEVELOPMENT DEMO",
    );
    expect(
      (await commercial.request(`${ORIGIN}/demo/external/access`)).status,
    ).toBe(404);

    const retrievalOnly = createApp({
      demo: createLocalDevelopmentDemoRuntime(),
      externalRetrievalEnabled: true,
    });
    expect(
      (await retrievalOnly.request(`${ORIGIN}/demo/external/access`)).status,
    ).toBe(200);
    expect(
      (await retrievalOnly.request(`${ORIGIN}/demo/commercial`)).status,
    ).toBe(404);
  });

  it("creates bounded intake through quarantine then the trusted synthetic CLEAN scan path", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture, [
      syntheticFile("record.pdf", "application/pdf"),
      syntheticFile("image.jpg", "image/jpeg"),
      syntheticFile("note.txt", "text/plain"),
    ]);
    const listed = await candidates(fixture, threadId);

    expect(listed).toHaveLength(3);
    expect(listed.every((item) => item.safetyState === "CLEAN")).toBe(true);
    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(events.map((event) => event.eventType)).toEqual([
      "THREAD_CREATED",
      "MESSAGE_APPENDED",
      "ATTACHMENT_REGISTERED",
      "ATTACHMENT_QUARANTINED",
      "ATTACHMENT_SCAN_ACCEPTED",
      "ATTACHMENT_REGISTERED",
      "ATTACHMENT_QUARANTINED",
      "ATTACHMENT_SCAN_ACCEPTED",
      "ATTACHMENT_REGISTERED",
      "ATTACHMENT_QUARANTINED",
      "ATTACHMENT_SCAN_ACCEPTED",
    ]);
    expect(
      events.some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(
      fixture.runtime.commercialWorkflow.getNotifications(),
    ).toEqual([{ message: "A secure exchange item is available." }]);
  });

  it("rejects unsupported type/extension, oversized files, attachment-count overflow, and cross-site intake", async () => {
    const unsupported = createFixture();
    const badForm = new FormData();
    badForm.set("routingCategory", "RECORDS");
    badForm.set("initialMessage", "Synthetic unsupported upload.");
    badForm.append(
      "attachments",
      syntheticFile("unsafe.html", "text/html"),
    );
    expect(
      (
        await unsupported.app.request(`${ORIGIN}/demo/commercial/intake`, {
          method: "POST",
          headers: { Origin: ORIGIN },
          body: badForm,
        })
      ).status,
    ).toBe(400);

    const mismatched = createFixture();
    const mismatchForm = new FormData();
    mismatchForm.set("routingCategory", "RECORDS");
    mismatchForm.set("initialMessage", "Synthetic mismatch.");
    mismatchForm.append(
      "attachments",
      syntheticFile("mismatch.pdf", "image/jpeg"),
    );
    expect(
      (
        await mismatched.app.request(`${ORIGIN}/demo/commercial/intake`, {
          method: "POST",
          headers: { Origin: ORIGIN },
          body: mismatchForm,
        })
      ).status,
    ).toBe(400);

    const oversized = createFixture();
    const oversizedForm = new FormData();
    oversizedForm.set("routingCategory", "RECORDS");
    oversizedForm.set("initialMessage", "Synthetic oversized upload.");
    oversizedForm.append(
      "attachments",
      syntheticFile(
        "oversized.pdf",
        "application/pdf",
        new Uint8Array(2 * 1024 * 1024 + 1),
      ),
    );
    expect(
      (
        await oversized.app.request(`${ORIGIN}/demo/commercial/intake`, {
          method: "POST",
          headers: { Origin: ORIGIN },
          body: oversizedForm,
        })
      ).status,
    ).toBe(400);

    const overflow = createFixture();
    const overflowForm = new FormData();
    overflowForm.set("routingCategory", "RECORDS");
    overflowForm.set("initialMessage", "Synthetic count overflow.");
    for (let index = 0; index < 5; index += 1) {
      overflowForm.append(
        "attachments",
        syntheticFile(`record-${index}.pdf`, "application/pdf"),
      );
    }
    expect(
      (
        await overflow.app.request(`${ORIGIN}/demo/commercial/intake`, {
          method: "POST",
          headers: { Origin: ORIGIN },
          body: overflowForm,
        })
      ).status,
    ).toBe(400);

    const crossSite = createFixture();
    const crossSiteForm = new FormData();
    crossSiteForm.set("routingCategory", "RECORDS");
    crossSiteForm.set("initialMessage", "Synthetic cross-site upload.");
    crossSiteForm.append("attachments", syntheticFile());
    expect(
      (
        await crossSite.app.request(`${ORIGIN}/demo/commercial/intake`, {
          method: "POST",
          headers: { Origin: "https://example.invalid" },
          body: crossSiteForm,
        })
      ).status,
    ).toBe(403);
    expect(
      await crossSite.runtime.store.listThreadsForQueue(
        crossSite.runtime.deploymentId,
        crossSite.runtime.queueId,
      ),
    ).toEqual([]);
  });

  it("serves CLEAN image and PDF preview bytes read-only with conservative headers and text metadata fallback", async () => {
    const imageFixture = createFixture();
    const imageBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const imageThread = await submitIntake(imageFixture, [
      syntheticFile("synthetic.png", "image/png", imageBytes),
    ]);
    const imageCandidate = (await candidates(imageFixture, imageThread))[0];
    expect(imageCandidate).toBeDefined();
    const before = imageFixture.runtime.store.listAuditEvents(
      imageFixture.runtime.deploymentId,
      imageThread,
    );
    const imageResponse = await imageFixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${imageThread}/preview/${imageCandidate?.messageId}/${imageCandidate?.attachmentId}`,
    );
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
    expect(imageResponse.headers.get("cache-control")).toBe("no-store, private");
    expect(imageResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(imageResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect(imageResponse.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(imageBytes);
    expect(
      imageFixture.runtime.store.listAuditEvents(
        imageFixture.runtime.deploymentId,
        imageThread,
      ),
    ).toEqual(before);

    const pdfFixture = createFixture();
    const pdfThread = await submitIntake(pdfFixture);
    const pdfCandidate = (await candidates(pdfFixture, pdfThread))[0];
    const pdfResponse = await pdfFixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${pdfThread}/preview/${pdfCandidate?.messageId}/${pdfCandidate?.attachmentId}`,
    );
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("content-type")).toBe("application/pdf");
    expect(pdfResponse.headers.get("content-disposition")).toBeNull();

    const textFixture = createFixture();
    const textThread = await submitIntake(textFixture, [
      syntheticFile("note.txt", "text/plain"),
    ]);
    const textCandidate = (await candidates(textFixture, textThread))[0];
    const textResponse = await textFixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${textThread}/preview/${textCandidate?.messageId}/${textCandidate?.attachmentId}`,
    );
    expect(textResponse.status).toBe(415);
    expect(await textResponse.text()).toContain("manual-download fallback");
  });

  it("denies preview and download while QUARANTINED without creating evidence", async () => {
    const fixture = createFixture();
    const seeded = await seedQuarantinedCommercialThread(fixture);
    const before = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      seeded.threadId,
    );
    const preview = await fixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${seeded.threadId}/preview/${seeded.messageId}/${seeded.attachmentId}`,
    );
    expect(preview.status).toBe(409);

    const download = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${seeded.threadId}/download`,
      { messageId: seeded.messageId, attachmentId: seeded.attachmentId },
    );
    expect(download.status).toBe(409);
    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        seeded.threadId,
      ),
    ).toEqual(before);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        seeded.threadId,
      ),
    ).toEqual([]);
  });

  it("keeps explicit manual download mutation-aware and separate from FILED/completion", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture);
    const candidate = (await candidates(fixture, threadId))[0];
    expect(candidate).toBeDefined();

    const crossSite = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/download`,
      {
        messageId: candidate?.messageId ?? "",
        attachmentId: candidate?.attachmentId ?? "",
      },
      "https://example.invalid",
    );
    expect(crossSite.status).toBe(403);

    const success = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/download`,
      {
        messageId: candidate?.messageId ?? "",
        attachmentId: candidate?.attachmentId ?? "",
      },
    );
    expect(success.status).toBe(200);
    expect(success.headers.get("content-disposition")).toContain(
      "attachment; filename=",
    );
    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(
      events.filter((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toHaveLength(1);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);
    expect(
      await fixture.runtime.store.getThread(fixture.runtime.deploymentId, threadId),
    ).toMatchObject({ state: "NEW" });
    expect(
      fixture.runtime.commercialWorkflow.getDiagnostics()
        .manual_download_fallback_used,
    ).toBe(1);
  });

  it("requires explicit fixture selection, blocks unresolved filing, and never treats sender DOB as a downstream mutation", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture);
    const pageBefore = await fixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${threadId}`,
    );
    const bodyBefore = await pageBefore.text();
    expect(bodyBefore).toContain("SENDER-SUPPLIED MATCHING EVIDENCE");
    expect(bodyBefore).toContain("1985-01-02");
    expect(bodyBefore).toContain("WILL NOT CHANGE");
    expect(bodyBefore).toContain("downstream patient demographics");

    await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/patient/not-found`,
      {},
    );
    const blocked = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/simulate`,
      { outcome: "SUCCESS" },
    );
    expect(blocked.status).toBe(409);

    const search = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/patient/search`,
      { searchName: "Avery Example", searchDob: "1985-01-02" },
    );
    expect(search.status).toBe(303);
    expect(
      fixture.runtime.commercialWorkflow.getThreadState(threadId)
        .confirmedPatient,
    ).toBeUndefined();

    const select = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/patient/select`,
      { patientNumber: "DEMO-1001" },
    );
    expect(select.status).toBe(303);
    expect(
      fixture.runtime.commercialWorkflow.getThreadState(threadId)
        .confirmedPatient?.patientNumber,
    ).toBe("DEMO-1001");
  });

  it("rejects tampered mappings and persists only allowlisted corrections in demo state", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture);
    const candidate = (await candidates(fixture, threadId))[0];
    expect(candidate).toBeDefined();

    const tampered = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/mapping`,
      {
        attachmentId: candidate?.attachmentId ?? "",
        destination: "INJECTED_DESTINATION",
        classification: "DOCUMENT",
      },
    );
    expect(tampered.status).toBe(400);

    const corrected = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/mapping`,
      {
        attachmentId: candidate?.attachmentId ?? "",
        destination: "PATIENT_IMAGES",
        classification: "IMAGE",
      },
    );
    expect(corrected.status).toBe(303);
    expect(
      fixture.runtime.commercialWorkflow.getThreadState(threadId)
        .filingMappings[0],
    ).toMatchObject({ destination: "PATIENT_IMAGES", classification: "IMAGE" });
    expect(fixture.runtime.commercialWorkflow.getDiagnostics()).toMatchObject({
      proposed_category_corrected: 1,
      proposed_classification_corrected: 1,
      filing_preview_changed: 1,
    });
  });

  it("preserves simulation != FILED != completion != disposition and prevents duplicate filing confirmation", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture);

    const prematureCompletion = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/complete`,
      { expectedVersion: "1" },
    );
    expect(prematureCompletion.status).toBe(409);

    await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/patient/verify-number`,
      { patientNumber: "DEMO-1001" },
    );
    await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/patient/select`,
      { patientNumber: "DEMO-1001" },
    );

    await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/simulate`,
      { outcome: "FAILURE" },
    );
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);

    await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/simulate`,
      { outcome: "SUCCESS" },
    );
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);
    expect(
      await fixture.runtime.store.getThread(fixture.runtime.deploymentId, threadId),
    ).toMatchObject({ state: "NEW", version: 1 });

    const confirmation = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/confirm-filing`,
      {},
    );
    expect(confirmation.status).toBe(303);
    const attestations = await fixture.runtime.store.listTransferAttestations(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(attestations).toHaveLength(1);
    expect(attestations[0]).toMatchObject({
      outcome: "FILED",
      destinationCategory: SYNTHETIC_PATIENT_RECORD_DESTINATION,
      actorRef: fixture.runtime.staffActor.actorRef,
    });
    expect(
      await fixture.runtime.store.getThread(fixture.runtime.deploymentId, threadId),
    ).toMatchObject({ state: "NEW" });

    const replay = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/confirm-filing`,
      {},
    );
    expect(replay.status).toBe(409);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toHaveLength(1);

    const completion = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/complete`,
      { expectedVersion: "1" },
    );
    expect(completion.status).toBe(303);
    expect(
      await fixture.runtime.store.getThread(fixture.runtime.deploymentId, threadId),
    ).toMatchObject({ state: "COMPLETED", version: 2 });

    const disposition = await postForm(
      fixture.app,
      `/demo/commercial/staff/threads/${threadId}/dispose`,
      { expectedVersion: "2" },
    );
    expect(disposition.status).toBe(303);
    expect(
      await fixture.runtime.store.getThread(fixture.runtime.deploymentId, threadId),
    ).toMatchObject({ state: "DISPOSED", version: 3 });
  });

  it("keeps GET views and sanitized diagnostics non-mutating and free of workflow-sensitive values", async () => {
    const fixture = createFixture();
    const threadId = await submitIntake(fixture);
    const before = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    await fixture.app.request(
      `${ORIGIN}/demo/commercial/staff/threads/${threadId}`,
    );
    const diagnosticsResponse = await fixture.app.request(
      `${ORIGIN}/demo/commercial/admin/diagnostics`,
    );
    const diagnosticsBody = await diagnosticsResponse.text();

    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(before);
    expect(diagnosticsBody).toContain("Fixed aggregate counters only");
    expect(diagnosticsBody).toContain("A secure exchange item is available.");
    expect(diagnosticsBody).not.toContain("Synthetic Avery Example");
    expect(diagnosticsBody).not.toContain("1985-01-02");
    expect(diagnosticsBody).not.toContain("DEMO-1001");
    expect(diagnosticsBody).not.toContain("synthetic-record.pdf");
    expect(diagnosticsResponse.headers.get("cache-control")).toBe("no-store");
  });
});
