import { describe, expect, it } from "vitest";

import { EXTERNAL_RETRIEVAL_ROUTE_PREFIX } from "../../src/http/external-retrieval-development.js";
import {
  IN_MEMORY_ORIGIN,
  createExternalDemoFixture,
  createSyntheticThread,
  establishCapability,
  issueGrant,
  postForm,
} from "../helpers/external-demo-fixture.js";

function postReply(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  cookie: string,
  messageBody: string,
): Promise<Response> | Response {
  return postForm(
    fixture.app,
    `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`,
    { messageBody },
    { cookie },
  );
}

describe("external reply development HTTP slice", () => {
  it("remains disabled when the external development gate is disabled", async () => {
    const fixture = createExternalDemoFixture(false);
    const response = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`,
    );
    expect(response.status).toBe(404);
  });

  it("accepts reply-only authority without granting thread read", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const before = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    const expectedActor = before[0]?.actorRef;
    const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
    const { response: established, cookie } = await establishCapability(
      fixture,
      grant,
    );
    expect(established.status).toBe(303);

    const session = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
      { headers: { Cookie: cookie ?? "" } },
    );
    const sessionHtml = await session.text();
    expect(sessionHtml).toContain("Send reply");
    expect(sessionHtml).not.toContain("Read conversation");

    const readResponse = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
      { headers: { Cookie: cookie ?? "" } },
    );
    expect(readResponse.status).toBe(403);

    const reply = await postReply(
      fixture,
      cookie ?? "",
      "Synthetic browser reply.",
    );
    expect(reply.status).toBe(303);
    expect(reply.headers.get("location")).toBe(
      `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply/sent`,
    );
    expect(reply.headers.get("location")).not.toContain(grant.secret);

    const messages = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(messages.at(-1)).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      actorRef: expectedActor,
      body: { kind: "PLAIN_TEXT", text: "Synthetic browser reply." },
    });

    const thread = await fixture.runtime.store.getThread(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(thread).toMatchObject({
      state: "NEW",
      updatedAt: fixture.runtime.now(),
      lastActivityAt: fixture.runtime.now(),
      attentionAt: fixture.runtime.now(),
    });
  });

  it("denies a read-only capability while preserving read authority", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_READ"]);
    const { cookie } = await establishCapability(fixture, grant);
    const response = await postReply(fixture, cookie ?? "", "Denied reply");
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    const conversation = await fixture.app.request(
      `${IN_MEMORY_ORIGIN}${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
      { headers: { Cookie: cookie ?? "" } },
    );
    expect(conversation.status).toBe(200);
  });

  it("rejects invalid plain-text bodies without appending a message", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
    const { cookie } = await establishCapability(fixture, grant);
    const before = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    for (const body of ["", "   \n\t ", "x".repeat(8001)]) {
      const response = await postReply(fixture, cookie ?? "", body);
      expect(response.status).toBe(400);
    }
    expect(
      await fixture.runtime.store.listMessages(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toHaveLength(before.length);
  });
});