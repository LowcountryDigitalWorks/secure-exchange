import { describe, expect, it } from "vitest";

import type { ThreadLifecycleState } from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  STAFF_A,
  THREAD_A,
  actorContext,
  makeFixture,
} from "../helpers/workflow-fixture.js";

const permittedStates: readonly ThreadLifecycleState[] = [
  "NEW",
  "IN_PROGRESS",
  "AWAITING_EXTERNAL",
  "AWAITING_STAFF",
];
const prohibitedStates: readonly ThreadLifecycleState[] = [
  "COMPLETED",
  "EXPIRED",
  "DISPOSED",
];

describe("conversation reply lifecycle", () => {
  it.each(permittedStates)(
    "appends a staff reply without changing permitted lifecycle state %s",
    async (state) => {
      const { conversationService, store } = makeFixture({ threadState: state });

      const result = await conversationService.replyToConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        expectedVersion: 3,
        messageId: `message-${state}`,
        messageBody: `Synthetic reply while ${state}.`,
        auditEventId: `audit-${state}`,
        at: "2026-08-12T20:00:00.000Z",
      });

      expect(result.thread.state).toBe(state);
      expect(result.thread.version).toBe(4);
      expect(result.message.actorRef).toBe(STAFF_A);
      expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
        expect.objectContaining({ eventType: "MESSAGE_APPENDED" }),
      ]);
    },
  );

  it.each(prohibitedStates)(
    "fails closed with no partial mutation for prohibited lifecycle state %s",
    async (state) => {
      const { conversationService, store } = makeFixture({ threadState: state });
      const before = await store.getThread(DEPLOYMENT_A, THREAD_A);

      await expect(
        conversationService.replyToConversation({
          actor: actorContext(),
          deploymentId: DEPLOYMENT_A,
          threadId: THREAD_A,
          expectedVersion: 3,
          messageId: `message-${state}`,
          messageBody: `Synthetic rejected reply while ${state}.`,
          auditEventId: `audit-${state}`,
          at: "2026-08-12T20:00:00.000Z",
        }),
      ).rejects.toMatchObject({ code: "REPLY_NOT_ALLOWED" });

      expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(before);
      expect(await store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual([]);
      expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
    },
  );
});
