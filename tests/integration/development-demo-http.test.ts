import { describe, expect, it } from "vitest";

import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { createApp } from "../../src/http/app.js";
import {
  createLocalDevelopmentDemoRuntime,
  type LocalDevelopmentDemoOptions,
} from "../../src/http/development-demo.js";

const ORIGIN = "http://localhost";

class DeterministicIdGenerator implements OpaqueIdGenerator {
  private sequence = 0;

  generate(purpose: OpaqueIdPurpose): string {
    this.sequence += 1;
    return `${purpose}-${this.sequence}`;
  }
}

function createFixture(options: LocalDevelopmentDemoOptions = {}) {
  let tick = 0;
  const runtime = createLocalDevelopmentDemoRuntime({
    idGenerator: new DeterministicIdGenerator(),
    now: () => {
      const value = new Date(Date.UTC(2026, 7, 12, 20, 0, tick));
      tick += 1;
      return value.toISOString();
    },
    ...options,
  });
  return { runtime, app: createApp({ demo: runtime }) };
}

function postForm(
  app: ReturnType<typeof createApp>,
  path: string,
  fields: Readonly<Record<string, string>>,
  origin = ORIGIN,
): Response | Promise<Response> {
  return app.request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function submitSyntheticExchange(
  fixture: ReturnType<typeof createFixture>,
  message = "Synthetic browser-submitted message.",
): Promise<string> {
  const response = await postForm(fixture.app, "/demo/external", {
    routingCategory: "GENERAL",
    initialMessage: message,
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/demo/external/confirmation");

  const threads = await fixture.runtime.store.listThreadsForQueue(
    fixture.runtime.deploymentId,
    fixture.runtime.queueId,
  );
  expect(threads).toHaveLength(1);
  return threads[0]?.threadId ?? "";
}

describe("synthetic development HTTP vertical slice", () => {
  it("renders an enabled accessible-form surface without browser-authoritative identifiers", async () => {
    const { app } = createFixture();
    const response = await app.request(`${ORIGIN}/demo/external`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Synthetic Development Demo");
    expect(body).toContain('name="routingCategory"');
    expect(body).toContain('name="initialMessage"');
    expect(body).not.toContain('name="threadId"');
    expect(body).not.toContain('name="messageId"');
    expect(body).not.toContain('name="auditEventId"');
    expect(body).not.toContain('name="externalParticipantRef"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );
  });

  it("requires same-origin mutation requests", async () => {
    const fixture = createFixture();
    const response = await postForm(
      fixture.app,
      "/demo/external",
      {
        routingCategory: "GENERAL",
        initialMessage: "Synthetic cross-site attempt.",
      },
      "https://example.invalid",
    );

    expect(response.status).toBe(403);
    expect(
      await fixture.runtime.store.listThreadsForQueue(
        fixture.runtime.deploymentId,
        fixture.runtime.queueId,
      ),
    ).toEqual([]);
  });

  it("creates accountless synthetic exchange with server-generated authoritative identifiers and PRG", async () => {
    const fixture = createFixture();
    const response = await postForm(fixture.app, "/demo/external", {
      routingCategory: "GENERAL",
      initialMessage: "Synthetic browser message.",
      threadId: "browser-thread",
      messageId: "browser-message",
      auditEventId: "browser-audit",
      externalParticipantRef: "browser-external",
      actorRef: "browser-actor",
      deploymentId: "browser-deployment",
      queueId: "browser-queue",
    });

    expect(response.status).toBe(303);
    const threads = await fixture.runtime.store.listThreadsForQueue(
      fixture.runtime.deploymentId,
      fixture.runtime.queueId,
    );
    expect(threads).toHaveLength(1);
    const thread = threads[0];
    expect(thread?.threadId).toBe("thread-1");
    expect(thread?.threadId).not.toBe("browser-thread");

    const messages = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      thread?.threadId ?? "",
    );
    expect(messages[0]).toMatchObject({
      messageId: "message-3",
      actorRef: "external-participant-2",
      direction: "EXTERNAL_TO_STAFF",
    });
    expect(messages[0]?.actorRef).not.toBe("browser-external");

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      thread?.threadId ?? "",
    );
    expect(events).toHaveLength(2);
    expect(
      events.every((event) => event.actorRef === "external-participant-2"),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain("Synthetic browser message.");
  });

  it("rejects invalid routing and inactive queues without creating state", async () => {
    const invalid = createFixture();
    const invalidResponse = await postForm(invalid.app, "/demo/external", {
      routingCategory: "NOT_ALLOWED",
      initialMessage: "Synthetic invalid route.",
    });
    expect(invalidResponse.status).toBe(400);
    expect(
      await invalid.runtime.store.listThreadsForQueue(
        invalid.runtime.deploymentId,
        invalid.runtime.queueId,
      ),
    ).toEqual([]);

    const inactive = createFixture({ queueActive: false });
    const inactiveResponse = await postForm(inactive.app, "/demo/external", {
      routingCategory: "GENERAL",
      initialMessage: "Synthetic inactive queue route.",
    });
    expect(inactiveResponse.status).toBe(400);
  });

  it("does not mutate workflow state on GET requests", async () => {
    const fixture = createFixture();
    const threadId = await submitSyntheticExchange(fixture);
    const before = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );

    await fixture.app.request(`${ORIGIN}/demo`);
    await fixture.app.request(`${ORIGIN}/demo/external`);
    await fixture.app.request(`${ORIGIN}/demo/external/confirmation`);
    await fixture.app.request(`${ORIGIN}/demo/staff/queue`);
    await fixture.app.request(`${ORIGIN}/demo/staff/threads/${threadId}`);

    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(before);
  });

  it("renders metadata-only staff queue candidates without message body content", async () => {
    const fixture = createFixture();
    const sensitiveSyntheticBody =
      "Synthetic sensitive queue-excluded message body 41928.";
    await submitSyntheticExchange(fixture, sensitiveSyntheticBody);

    const response = await fixture.app.request(`${ORIGIN}/demo/staff/queue`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Synthetic Intake Queue");
    expect(body).toContain("GENERAL");
    expect(body).not.toContain(sensitiveSyntheticBody);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("records Opened only through explicit POST then authoritatively renders chronological messages on GET", async () => {
    const fixture = createFixture();
    const threadId = await submitSyntheticExchange(
      fixture,
      "Synthetic first chronological message.",
    );

    const openResponse = await postForm(
      fixture.app,
      `/demo/staff/threads/${threadId}/open`,
      {},
    );
    expect(openResponse.status).toBe(303);

    const afterOpen = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(afterOpen.map((event) => event.eventType)).toEqual([
      "THREAD_CREATED",
      "MESSAGE_APPENDED",
      "THREAD_OPENED",
    ]);
    expect(
      afterOpen.some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);

    const pageResponse = await fixture.app.request(
      `${ORIGIN}/demo/staff/threads/${threadId}`,
    );
    const pageBody = await pageResponse.text();
    expect(pageBody).toContain("External → Staff");
    expect(pageBody).toContain("Synthetic first chronological message.");
    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(afterOpen);
  });

  it("appends authorized staff reply with server-held staff identity, expected-version protection, and no lifecycle inference", async () => {
    const fixture = createFixture();
    const threadId = await submitSyntheticExchange(fixture);

    const response = await postForm(
      fixture.app,
      `/demo/staff/threads/${threadId}/reply`,
      {
        expectedVersion: "1",
        messageBody: "Synthetic staff browser reply.",
        actorRef: "browser-selected-staff",
        messageId: "browser-selected-message",
        auditEventId: "browser-selected-audit",
      },
    );
    expect(response.status).toBe(303);

    const thread = await fixture.runtime.store.getThread(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(thread).toMatchObject({ state: "NEW", version: 2 });

    const messages = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      direction: "STAFF_TO_EXTERNAL",
      actorRef: fixture.runtime.staffActor.actorRef,
      body: { kind: "PLAIN_TEXT", text: "Synthetic staff browser reply." },
    });
    expect(messages[1]?.messageId).not.toBe("browser-selected-message");

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(events.map((event) => event.eventType)).toEqual([
      "THREAD_CREATED",
      "MESSAGE_APPENDED",
      "MESSAGE_APPENDED",
    ]);
    expect(JSON.stringify(events)).not.toContain(
      "Synthetic staff browser reply.",
    );
  });

  it("rejects stale browser reply without partial message, audit, or activity mutation", async () => {
    const fixture = createFixture();
    const threadId = await submitSyntheticExchange(fixture);
    const beforeThread = await fixture.runtime.store.getThread(
      fixture.runtime.deploymentId,
      threadId,
    );
    const beforeMessages = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    const beforeEvents = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );

    const response = await postForm(
      fixture.app,
      `/demo/staff/threads/${threadId}/reply`,
      {
        expectedVersion: "2",
        messageBody: "Synthetic stale browser reply.",
      },
    );
    expect(response.status).toBe(409);
    expect(
      await fixture.runtime.store.getThread(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(beforeThread);
    expect(
      await fixture.runtime.store.listMessages(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(beforeMessages);
    expect(
      fixture.runtime.store.listAuditEvents(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual(beforeEvents);
  });

  it("escapes HTML-like message content and sends conservative conversation headers", async () => {
    const fixture = createFixture();
    const payload =
      '<script>alert("synthetic")</script><strong>unsafe</strong>';
    const threadId = await submitSyntheticExchange(fixture, payload);

    const response = await fixture.app.request(
      `${ORIGIN}/demo/staff/threads/${threadId}`,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(
      "&lt;script&gt;alert(&quot;synthetic&quot;)&lt;/script&gt;",
    );
    expect(body).not.toContain('<script>alert("synthetic")</script>');
    expect(body).not.toContain("<strong>unsafe</strong>");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
  });

  it("performs Start work only as an explicit POST and never as an open or reply side effect", async () => {
    const fixture = createFixture();
    const threadId = await submitSyntheticExchange(fixture);

    await postForm(fixture.app, `/demo/staff/threads/${threadId}/open`, {});
    expect(
      await fixture.runtime.store.getThread(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toMatchObject({ state: "NEW", version: 1 });

    const response = await postForm(
      fixture.app,
      `/demo/staff/threads/${threadId}/start`,
      { expectedVersion: "1" },
    );
    expect(response.status).toBe(303);
    expect(
      await fixture.runtime.store.getThread(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toMatchObject({ state: "IN_PROGRESS", version: 2 });
  });

  it("returns conservative not-found behavior for arbitrary thread identifiers", async () => {
    const fixture = createFixture();
    const response = await fixture.app.request(
      `${ORIGIN}/demo/staff/threads/browser-supplied-thread`,
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain(
      "requested synthetic development resource is not available",
    );
    expect(body).not.toContain("Actor is not authorized");
  });
});
