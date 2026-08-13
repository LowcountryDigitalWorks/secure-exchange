import type { IssuedAccessGrant } from "../../src/application/access-grant-service.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import type { AccessGrantOperation } from "../../src/domain/index.js";
import { createApp } from "../../src/http/app.js";
import { createLocalDevelopmentDemoRuntime } from "../../src/http/development-demo.js";

export const IN_MEMORY_ORIGIN = "http://localhost";

class DeterministicIdGenerator implements OpaqueIdGenerator {
  private sequence = 0;

  generate(purpose: OpaqueIdPurpose): string {
    this.sequence += 1;
    return `${purpose}-${this.sequence}`;
  }
}

export function createExternalDemoFixture(externalRetrievalEnabled = true) {
  let nowMs = Date.UTC(2026, 7, 13, 3, 0, 0);
  const runtime = createLocalDevelopmentDemoRuntime({
    idGenerator: new DeterministicIdGenerator(),
    now: () => new Date(nowMs).toISOString(),
  });
  return {
    runtime,
    app: createApp({ demo: runtime, externalRetrievalEnabled }),
    advanceSeconds(seconds: number): void {
      nowMs += seconds * 1_000;
    },
  };
}

export function postForm(
  app: ReturnType<typeof createApp>,
  path: string,
  fields: Readonly<Record<string, string>>,
  options: {
    readonly requestOrigin?: string;
    readonly baseOrigin?: string;
    readonly cookie?: string | undefined;
  } = {},
): Response | Promise<Response> {
  const baseOrigin = options.baseOrigin ?? IN_MEMORY_ORIGIN;
  return app.request(`${baseOrigin}${path}`, {
    method: "POST",
    headers: {
      Origin: options.requestOrigin ?? baseOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

export async function createSyntheticThread(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  message = "Synthetic external secure-access message.",
): Promise<{ readonly threadId: string; readonly messageId: string }> {
  const response = await postForm(fixture.app, "/demo/external", {
    routingCategory: "GENERAL",
    initialMessage: message,
  });
  if (response.status !== 303) {
    throw new Error("Synthetic thread creation failed.");
  }
  const threads = await fixture.runtime.store.listThreadsForQueue(
    fixture.runtime.deploymentId,
    fixture.runtime.queueId,
  );
  const thread = threads.at(-1);
  if (thread === undefined) {
    throw new Error("Synthetic thread was not created.");
  }
  const messages = await fixture.runtime.store.listMessages(
    fixture.runtime.deploymentId,
    thread.threadId,
  );
  const firstMessage = messages[0];
  if (firstMessage === undefined) {
    throw new Error("Synthetic message was not created.");
  }
  return { threadId: thread.threadId, messageId: firstMessage.messageId };
}

export async function issueGrant(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  threadId: string,
  requestedOperations: readonly AccessGrantOperation[],
  requestedLifetimeSeconds = 600,
): Promise<IssuedAccessGrant> {
  return fixture.runtime.accessGrantService.issueAccessGrant({
    actor: fixture.runtime.staffActor,
    deploymentId: fixture.runtime.deploymentId,
    threadId,
    requestedOperations,
    requestedLifetimeSeconds,
  });
}

export async function createCleanAttachment(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  threadId: string,
  messageId: string,
  originalDisplayFilename = "synthetic-report.txt",
  content = new TextEncoder().encode("synthetic protected content"),
) {
  const attachment = await fixture.runtime.attachmentService.ingestAttachment({
    deploymentId: fixture.runtime.deploymentId,
    threadId,
    messageId,
    originalDisplayFilename,
    declaredMediaCategory: "TEXT",
    declaredMediaType: "text/plain",
    content,
    at: fixture.runtime.now(),
  });
  return fixture.runtime.attachmentService.recordScanResult({
    deploymentId: fixture.runtime.deploymentId,
    threadId,
    messageId,
    attachmentId: attachment.attachmentId,
    scanResultRef: `scan-${attachment.attachmentId}`,
    outcome: "CLEAN",
    at: fixture.runtime.now(),
  });
}

export async function establishCapability(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  grant: IssuedAccessGrant,
  options: {
    readonly requestOrigin?: string;
    readonly baseOrigin?: string;
  } = {},
): Promise<{ readonly response: Response; readonly cookie?: string }> {
  const response = await postForm(
    fixture.app,
    "/demo/external/access",
    {
      threadId: grant.threadId,
      grantId: grant.grantId,
      accessSecret: grant.secret,
    },
    options,
  );
  const setCookie = response.headers.get("set-cookie") ?? undefined;
  return {
    response,
    ...(setCookie === undefined ? {} : { cookie: setCookie.split(";", 1)[0] }),
  };
}
