import { describe, expect, it } from "vitest";

import {
  EXTERNAL_CAPABILITY_COOKIE_NAME,
  EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
  buildAttachmentContentDisposition,
} from "../../src/http/external-retrieval-development.js";
import {
  IN_MEMORY_ORIGIN,
  createCleanAttachment,
  createExternalDemoFixture,
  createSyntheticThread,
  establishCapability,
  issueGrant,
  postForm,
} from "../helpers/external-demo-fixture.js";

function cookieHeaders(cookie: string | undefined): HeadersInit {
  return cookie === undefined ? {} : { Cookie: cookie };
}

describe("external retrieval development HTTP adapter", () => {
  it("is disabled by default even when the existing synthetic demo is enabled", async () => {
    const fixture = createExternalDemoFixture(false);
    const response = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}`,
    );
    expect(response.status).toBe(404);
  });

  it("renders a POST-only credential form with conservative external page headers", async () => {
    const fixture = createExternalDemoFixture();
    const response = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}`,
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('method="post"');
    expect(body).toContain('name="threadId"');
    expect(body).toContain('name="grantId"');
    expect(body).toContain('name="accessSecret"');
    expect(body).not.toContain("localStorage");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("establishes a short-lived host-only HttpOnly Strict capability cookie without putting the secret in a URL", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const { response, cookie } = await establishCapability(fixture, grant);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
    );
    expect(response.headers.get("location")).not.toContain(grant.secret);
    expect(setCookie).toContain(`${EXTERNAL_CAPABILITY_COOKIE_NAME}=`);
    expect(setCookie).toContain(`Path=${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}`);
    expect(setCookie).toContain("Max-Age=600");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("Domain=");
    expect(cookie).toBeDefined();

    const secure = await establishCapability(fixture, grant, {
      baseOrigin: "https://localhost",
      requestOrigin: "https://localhost",
    });
    expect(secure.response.headers.get("set-cookie")).toContain("Secure");
  });

  it("returns one generic result for unusable credentials and never echoes the presented secret", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const badSecret = `${grant.secret}invalid`;
    const response = await postForm(
      fixture.app,
      EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
      {
        threadId,
        grantId: grant.grantId,
        accessSecret: badSecret,
      },
    );
    const body = await response.text();
    expect(response.status).toBe(403);
    expect(body).toContain("Secure access is unavailable");
    expect(body).not.toContain(badSecret);
    expect(body).not.toContain("grant");
    expect(body).not.toContain("revoked");
    expect(body).not.toContain("expired");
  });

  it("keeps THREAD_READ independent and renders escaped conversation content without internal identifiers", async () => {
    const fixture = createExternalDemoFixture();
    const payload = '<script id="synthetic-attack">alert(1)</script>';
    const { threadId, messageId } = await createSyntheticThread(
      fixture,
      payload,
    );
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const { cookie } = await establishCapability(fixture, grant);

    const conversation = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
      { headers: cookieHeaders(cookie) },
    );
    const body = await conversation.text();
    expect(conversation.status).toBe(200);
    expect(body).toContain(
      "&lt;script id=&quot;synthetic-attack&quot;&gt;alert(1)&lt;/script&gt;",
    );
    expect(body).not.toContain(payload);
    expect(body).not.toContain(messageId);
    expect(body).not.toContain(fixture.runtime.staffActor.actorRef);
    expect(body).not.toContain(fixture.runtime.queueId);
    expect(body).not.toContain(grant.grantId);
    expect(body).not.toContain(grant.secret);

    const attachments = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/attachments`,
      { headers: cookieHeaders(cookie) },
    );
    expect(attachments.status).toBe(403);
    expect(attachments.headers.get("set-cookie")).toBeNull();

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(
      events.filter((event) => event.eventType === "EXTERNAL_THREAD_RETRIEVED"),
    ).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(grant.secret);
  });

  it("keeps ATTACHMENT_READ independent and exposes only bounded clean candidate metadata", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId, messageId } = await createSyntheticThread(fixture);
    const clean = await createCleanAttachment(
      fixture,
      threadId,
      messageId,
      "../synthetic report.txt",
    );
    const quarantined =
      await fixture.runtime.attachmentService.ingestAttachment({
        deploymentId: fixture.runtime.deploymentId,
        threadId,
        messageId,
        originalDisplayFilename: "quarantined.txt",
        declaredMediaCategory: "TEXT",
        declaredMediaType: "text/plain",
        content: new TextEncoder().encode("not yet clean"),
        at: fixture.runtime.now(),
      });
    const grant = await issueGrant(fixture, threadId, ["ATTACHMENT_READ"]);
    const { cookie } = await establishCapability(fixture, grant);

    const conversation = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
      { headers: cookieHeaders(cookie) },
    );
    expect(conversation.status).toBe(403);
    expect(conversation.headers.get("set-cookie")).toBeNull();

    const response = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/attachments`,
      { headers: cookieHeaders(cookie) },
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(clean.safeDownloadFilename);
    expect(body).toContain(clean.normalizedMediaType);
    expect(body).toContain(`${clean.sizeBytes} bytes`);
    expect(body).toContain(`value="${messageId}"`);
    expect(body).toContain(`value="${clean.attachmentId}"`);
    expect(body).not.toContain(clean.originalDisplayFilename);
    expect(body).not.toContain(clean.contentRef);
    expect(body).not.toContain(quarantined.attachmentId);
    expect(body).not.toContain("QUARANTINED");
  });

  it("downloads only through the Release 0.8 service with attachment-safe no-store response headers and one download event", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId, messageId } = await createSyntheticThread(fixture);
    const attachment = await createCleanAttachment(
      fixture,
      threadId,
      messageId,
      '../unsafe "name".txt',
      new TextEncoder().encode("download body"),
    );
    const grant = await issueGrant(fixture, threadId, [
      "THREAD_READ",
      "ATTACHMENT_READ",
    ]);
    const { cookie } = await establishCapability(fixture, grant);

    const response = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`,
      { messageId, attachmentId: attachment.attachmentId },
      { cookie },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-length")).toBe(
      String(attachment.sizeBytes),
    );
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${attachment.safeDownloadFilename}"`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(await response.text()).toBe("download body");

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(
      events.filter((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(grant.secret);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);
    expect(
      await fixture.runtime.store.getThread(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toMatchObject({ state: "NEW" });
  });

  it("defensively prevents Content-Disposition header injection even if a future caller violates safe-filename assumptions", () => {
    const header = buildAttachmentContentDisposition(
      'evil"\r\nX-Injected: yes-✓.txt',
    );
    expect(header).toMatch(/^attachment; filename="/u);
    expect(header).not.toContain("\r");
    expect(header).not.toContain("\n");
    expect(header).not.toContain("✓");
  });

  it("denies cross-origin credential and download POSTs before application mutation", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId, messageId } = await createSyntheticThread(fixture);
    const attachment = await createCleanAttachment(
      fixture,
      threadId,
      messageId,
    );
    const grant = await issueGrant(fixture, threadId, ["ATTACHMENT_READ"]);

    const credentialResponse = await postForm(
      fixture.app,
      EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
      {
        threadId,
        grantId: grant.grantId,
        accessSecret: grant.secret,
      },
      { requestOrigin: "https://cross-origin.invalid" },
    );
    expect(credentialResponse.status).toBe(403);

    const { cookie } = await establishCapability(fixture, grant);
    const before = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    const downloadResponse = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`,
      { messageId, attachmentId: attachment.attachmentId },
      {
        cookie,
        requestOrigin: "https://cross-origin.invalid",
      },
    );
    expect(downloadResponse.status).toBe(403);
    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(before);
  });

  it("fails closed for non-CLEAN and missing or inconsistent protected content without download evidence", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId, messageId } = await createSyntheticThread(fixture);
    const quarantined =
      await fixture.runtime.attachmentService.ingestAttachment({
        deploymentId: fixture.runtime.deploymentId,
        threadId,
        messageId,
        originalDisplayFilename: "quarantine.txt",
        declaredMediaCategory: "TEXT",
        declaredMediaType: "text/plain",
        content: new TextEncoder().encode("quarantine"),
        at: fixture.runtime.now(),
      });
    const grant = await issueGrant(fixture, threadId, ["ATTACHMENT_READ"]);
    const { cookie } = await establishCapability(fixture, grant);

    let response = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`,
      { messageId, attachmentId: quarantined.attachmentId },
      { cookie },
    );
    expect(response.status).toBe(403);

    const clean = await createCleanAttachment(
      fixture,
      threadId,
      messageId,
      "missing.txt",
      new TextEncoder().encode("expected"),
    );
    await fixture.runtime.contentStore.delete(clean.contentRef);
    response = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`,
      { messageId, attachmentId: clean.attachmentId },
      { cookie },
    );
    expect(response.status).toBe(403);

    await fixture.runtime.contentStore.put(
      clean.contentRef,
      new TextEncoder().encode("wrong length payload"),
    );
    response = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`,
      { messageId, attachmentId: clean.attachmentId },
      { cookie },
    );
    expect(response.status).toBe(403);
    expect(
      fixture.runtime.store
        .listAuditEvents(fixture.runtime.deploymentId, threadId)
        .filter((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toEqual([]);
  });

  it("revalidates authoritative revocation and expiry after browser capability establishment and clears stale local state", async () => {
    const revokedFixture = createExternalDemoFixture();
    const revokedThread = await createSyntheticThread(revokedFixture);
    const revokedGrant = await issueGrant(
      revokedFixture,
      revokedThread.threadId,
      ["THREAD_READ"],
    );
    const revokedCapability = await establishCapability(
      revokedFixture,
      revokedGrant,
    );
    await revokedFixture.runtime.accessGrantService.revokeAccessGrant({
      actor: revokedFixture.runtime.staffActor,
      deploymentId: revokedFixture.runtime.deploymentId,
      threadId: revokedThread.threadId,
      grantId: revokedGrant.grantId,
      expectedVersion: 1,
    });
    let response = await revokedFixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
      { headers: cookieHeaders(revokedCapability.cookie) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    const expiredFixture = createExternalDemoFixture();
    const expiredThread = await createSyntheticThread(expiredFixture);
    const expiredGrant = await issueGrant(
      expiredFixture,
      expiredThread.threadId,
      ["THREAD_READ"],
      30,
    );
    const expiredCapability = await establishCapability(
      expiredFixture,
      expiredGrant,
    );
    expiredFixture.advanceSeconds(31);
    response = await expiredFixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
      { headers: cookieHeaders(expiredCapability.cookie) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("ends access by expiring the local capability cookie without revoking the AccessGrant", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const { cookie } = await establishCapability(fixture, grant);

    const response = await postForm(
      fixture.app,
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/end`,
      {},
      { cookie },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      EXTERNAL_RETRIEVAL_ROUTE_PREFIX,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    const stored = await fixture.runtime.store.getAccessGrant(
      fixture.runtime.deploymentId,
      grant.grantId,
    );
    expect(stored?.revokedAt).toBeUndefined();
  });
});
