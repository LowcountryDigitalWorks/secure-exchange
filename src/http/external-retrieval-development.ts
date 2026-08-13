import type { Context, Hono } from "hono";

import { DomainError } from "../domain/errors.js";
import {
  isExternalReplyAllowed,
  type AccessGrantOperation,
} from "../domain/index.js";
import {
  renderExternalAccessForm,
  renderExternalAccessUnavailable,
  renderExternalAttachmentCandidates,
  renderExternalConversationPage,
} from "../web/page.js";
import {
  renderExternalDevelopmentSession,
  renderExternalReplyForm,
  renderExternalReplyInvalid,
  renderExternalReplySubmitted,
} from "../web/external-reply-development-page.js";
import type { DevelopmentDemoRuntime } from "./development-demo.js";

export const EXTERNAL_RETRIEVAL_ROUTE_PREFIX = "/demo/external/access";
export const EXTERNAL_CAPABILITY_COOKIE_NAME = "sx_demo_external_capability";
export const EXTERNAL_CAPABILITY_MAX_AGE_SECONDS = 600;

interface ExternalBrowserCapability {
  readonly threadId: string;
  readonly grantId: string;
  readonly secret: string;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function boundedValue(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !hasControlCharacters(value)
  );
}

function isSameOriginPost(request: Request): boolean {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin";
  }

  const origin = request.headers.get("Origin");
  if (origin === null) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    if (
      parsedOrigin.protocol !== "http:" &&
      parsedOrigin.protocol !== "https:"
    ) {
      return false;
    }

    const requestHost = request.headers.get("Host");
    if (requestHost !== null) {
      return parsedOrigin.host === requestHost;
    }

    return parsedOrigin.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function capabilityCookieValue(capability: ExternalBrowserCapability): string {
  return encodeURIComponent(JSON.stringify(capability));
}

function capabilityCookie(
  capability: ExternalBrowserCapability,
  request: Request,
): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${EXTERNAL_CAPABILITY_COOKIE_NAME}=${capabilityCookieValue(capability)}; Path=${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}; Max-Age=${EXTERNAL_CAPABILITY_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function clearCapabilityCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${EXTERNAL_CAPABILITY_COOKIE_NAME}=; Path=${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function readCapability(
  request: Request,
): ExternalBrowserCapability | undefined {
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader === null) {
    return undefined;
  }

  const prefix = `${EXTERNAL_CAPABILITY_COOKIE_NAME}=`;
  const encoded = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (encoded === undefined || encoded.length > 3_800) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      !boundedValue(candidate["threadId"], 256) ||
      !boundedValue(candidate["grantId"], 256) ||
      !boundedValue(candidate["secret"], 512)
    ) {
      return undefined;
    }
    return {
      threadId: candidate["threadId"],
      grantId: candidate["grantId"],
      secret: candidate["secret"],
    };
  } catch {
    return undefined;
  }
}

async function operationIsCurrentlyUsable(
  demo: DevelopmentDemoRuntime,
  capability: ExternalBrowserCapability,
  operation: AccessGrantOperation,
): Promise<boolean> {
  try {
    await demo.accessGrantService.validatePresentedAccessGrant({
      deploymentId: demo.deploymentId,
      threadId: capability.threadId,
      grantId: capability.grantId,
      secret: capability.secret,
      operation,
    });
    if (operation === "THREAD_REPLY") {
      const thread = await demo.store.getThread(
        demo.deploymentId,
        capability.threadId,
      );
      return thread !== undefined && isExternalReplyAllowed(thread.state);
    }
    return true;
  } catch {
    return false;
  }
}

async function validatedOperations(
  demo: DevelopmentDemoRuntime,
  capability: ExternalBrowserCapability,
): Promise<readonly AccessGrantOperation[]> {
  const operations: readonly AccessGrantOperation[] = [
    "THREAD_READ",
    "ATTACHMENT_READ",
    "THREAD_REPLY",
  ];
  const usable: AccessGrantOperation[] = [];
  for (const operation of operations) {
    if (await operationIsCurrentlyUsable(demo, capability, operation)) {
      usable.push(operation);
    }
  }
  return usable;
}

async function validatesForAnyOperation(
  demo: DevelopmentDemoRuntime,
  capability: ExternalBrowserCapability,
): Promise<boolean> {
  return (await validatedOperations(demo, capability)).length > 0;
}

function unavailable(context: Context, clear = false): Response {
  if (clear) {
    context.header("Set-Cookie", clearCapabilityCookie(context.req.raw));
  }
  return context.html(renderExternalAccessUnavailable(), 403);
}

async function protectedUnavailable(
  context: Context,
  demo: DevelopmentDemoRuntime,
  capability: ExternalBrowserCapability | undefined,
): Promise<Response> {
  const shouldClear =
    capability === undefined ||
    !(await validatesForAnyOperation(demo, capability));
  return unavailable(context, shouldClear);
}

function parseCredentialForm(
  form: FormData,
): ExternalBrowserCapability | undefined {
  const threadId = form.get("threadId");
  const grantId = form.get("grantId");
  const secret = form.get("accessSecret");
  if (
    !boundedValue(threadId, 256) ||
    !boundedValue(grantId, 256) ||
    !boundedValue(secret, 512)
  ) {
    return undefined;
  }
  return { threadId, grantId, secret };
}

export function buildAttachmentContentDisposition(filename: string): string {
  const sanitized = filename
    .replace(/[\r\n"\\]/gu, "_")
    .replace(/[^\x20-\x7e]/gu, "_")
    .slice(0, 120);
  return `attachment; filename="${sanitized.length === 0 ? "attachment" : sanitized}"`;
}

export function registerExternalRetrievalDevelopmentRoutes(
  app: Hono,
  demo: DevelopmentDemoRuntime,
): void {
  app.get(EXTERNAL_RETRIEVAL_ROUTE_PREFIX, (context) =>
    context.html(renderExternalAccessForm()),
  );

  app.post(EXTERNAL_RETRIEVAL_ROUTE_PREFIX, async (context) => {
    if (!isSameOriginPost(context.req.raw)) {
      return unavailable(context, true);
    }

    try {
      const capability = parseCredentialForm(await context.req.raw.formData());
      if (
        capability === undefined ||
        !(await validatesForAnyOperation(demo, capability))
      ) {
        return unavailable(context, true);
      }

      context.header(
        "Set-Cookie",
        capabilityCookie(capability, context.req.raw),
      );
      return context.redirect(
        `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`,
        303,
      );
    } catch {
      return unavailable(context, true);
    }
  });

  app.get(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/session`, async (context) => {
    const capability = readCapability(context.req.raw);
    if (capability === undefined) {
      return unavailable(context, true);
    }
    const operations = await validatedOperations(demo, capability);
    if (operations.length === 0) {
      return unavailable(context, true);
    }
    return context.html(renderExternalDevelopmentSession(operations));
  });

  app.get(
    `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/conversation`,
    async (context) => {
      const capability = readCapability(context.req.raw);
      if (capability === undefined) {
        return unavailable(context, true);
      }

      try {
        const conversation =
          await demo.accessGrantService.retrieveExternalConversation({
            deploymentId: demo.deploymentId,
            threadId: capability.threadId,
            grantId: capability.grantId,
            secret: capability.secret,
          });
        return context.html(renderExternalConversationPage(conversation));
      } catch {
        return protectedUnavailable(context, demo, capability);
      }
    },
  );

  app.get(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/attachments`, async (context) => {
    const capability = readCapability(context.req.raw);
    if (capability === undefined) {
      return unavailable(context, true);
    }

    try {
      const candidates =
        await demo.externalAttachmentRetrievalService.listExternalAttachmentCandidates(
          {
            deploymentId: demo.deploymentId,
            threadId: capability.threadId,
            grantId: capability.grantId,
            secret: capability.secret,
          },
        );
      return context.html(renderExternalAttachmentCandidates(candidates));
    } catch {
      return protectedUnavailable(context, demo, capability);
    }
  });

  app.get(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`, async (context) => {
    const capability = readCapability(context.req.raw);
    if (capability === undefined) {
      return unavailable(context, true);
    }
    if (!(await operationIsCurrentlyUsable(demo, capability, "THREAD_REPLY"))) {
      return protectedUnavailable(context, demo, capability);
    }
    return context.html(renderExternalReplyForm());
  });

  app.post(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`, async (context) => {
    if (!isSameOriginPost(context.req.raw)) {
      return unavailable(context);
    }
    const capability = readCapability(context.req.raw);
    if (capability === undefined) {
      return unavailable(context, true);
    }

    try {
      const form = await context.req.raw.formData();
      const messageBody = form.get("messageBody");
      if (typeof messageBody !== "string") {
        return context.html(renderExternalReplyInvalid(), 400);
      }
      await demo.accessGrantService.replyExternalConversation({
        deploymentId: demo.deploymentId,
        threadId: capability.threadId,
        grantId: capability.grantId,
        secret: capability.secret,
        messageBody,
      });
      return context.redirect(
        `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply/sent`,
        303,
      );
    } catch (error: unknown) {
      if (error instanceof DomainError && error.code === "INVALID_MESSAGE_BODY") {
        return context.html(renderExternalReplyInvalid(), 400);
      }
      return protectedUnavailable(context, demo, capability);
    }
  });

  app.get(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply/sent`, (context) => {
    if (readCapability(context.req.raw) === undefined) {
      return unavailable(context, true);
    }
    return context.html(renderExternalReplySubmitted());
  });

  app.post(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/download`, async (context) => {
    if (!isSameOriginPost(context.req.raw)) {
      return unavailable(context);
    }
    const capability = readCapability(context.req.raw);
    if (capability === undefined) {
      return unavailable(context, true);
    }

    try {
      const form = await context.req.raw.formData();
      const messageId = form.get("messageId");
      const attachmentId = form.get("attachmentId");
      if (!boundedValue(messageId, 256) || !boundedValue(attachmentId, 256)) {
        return unavailable(context);
      }

      const result =
        await demo.externalAttachmentRetrievalService.retrieveExternalAttachment(
          {
            deploymentId: demo.deploymentId,
            threadId: capability.threadId,
            messageId,
            attachmentId,
            grantId: capability.grantId,
            secret: capability.secret,
          },
        );
      context.header("Content-Type", result.normalizedMediaType);
      context.header("Content-Length", String(result.byteLength));
      context.header(
        "Content-Disposition",
        buildAttachmentContentDisposition(result.safeDownloadFilename),
      );
      context.header("Cache-Control", "no-store, private");
      context.header("X-Content-Type-Options", "nosniff");
      context.header("Referrer-Policy", "no-referrer");
      context.header("Cross-Origin-Resource-Policy", "same-origin");
      return context.body(Uint8Array.from(result.content).buffer);
    } catch {
      return protectedUnavailable(context, demo, capability);
    }
  });

  app.post(`${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/end`, (context) => {
    if (!isSameOriginPost(context.req.raw)) {
      return unavailable(context);
    }
    context.header("Set-Cookie", clearCapabilityCookie(context.req.raw));
    return context.redirect(EXTERNAL_RETRIEVAL_ROUTE_PREFIX, 303);
  });
}