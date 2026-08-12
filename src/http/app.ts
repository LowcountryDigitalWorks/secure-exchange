import { Hono } from "hono";

import { ApplicationError } from "../application/errors.js";
import { getEngineeringStatus } from "../application/status.js";
import { DomainError, isStaffReplyAllowed } from "../domain/index.js";
import {
  renderConversation,
  renderDemoError,
  renderDevelopmentLanding,
  renderEngineeringShell,
  renderExternalConfirmation,
  renderExternalForm,
  renderStaffQueue,
  shellStyles,
} from "../web/page.js";
import type { DevelopmentDemoRuntime } from "./development-demo.js";

export interface CreateAppOptions {
  readonly demo?: DevelopmentDemoRuntime;
}

function contentSecurityPolicy(demoEnabled: boolean): string {
  return `default-src 'none'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action ${demoEnabled ? "'self'" : "'none'"}`;
}

function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function parseExpectedVersion(
  value: FormDataEntryValue | null,
): number | undefined {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function externalRoutingError(
  error: unknown,
): "bad-request" | "not-found" | "conflict" | "internal" {
  if (error instanceof DomainError) {
    if (error.code === "STALE_VERSION" || error.code === "REPLY_NOT_ALLOWED") {
      return "conflict";
    }
    return "bad-request";
  }

  if (error instanceof ApplicationError) {
    if (
      error.code === "RESOURCE_NOT_FOUND" ||
      error.code === "AUTHORIZATION_DENIED"
    ) {
      return "not-found";
    }
    return "bad-request";
  }

  return "internal";
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const demo = options.demo;
  const demoEnabled = demo !== undefined;
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();

    context.header(
      "Content-Security-Policy",
      contentSecurityPolicy(demoEnabled),
    );
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
  });

  app.get("/health", (context) => context.json(getEngineeringStatus()));

  app.get("/styles.css", (context) => {
    context.header("Content-Type", "text/css; charset=utf-8");
    return context.body(shellStyles);
  });

  app.get("/", (context) =>
    context.html(renderEngineeringShell(getEngineeringStatus(), demoEnabled)),
  );

  app.use("/demo/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    if (demo === undefined) {
      return context.notFound();
    }
    await next();
  });

  if (demo !== undefined) {
    const rejectCrossSitePost = (request: Request): boolean =>
      !isSameOriginPost(request);

    const renderMappedError = (
      context: Parameters<Parameters<typeof app.onError>[0]>[1],
      error: unknown,
      backHref: string,
    ): Response => {
      const category = externalRoutingError(error);
      if (category === "not-found") {
        return context.html(
          renderDemoError(
            "Not available",
            "The requested synthetic development resource is not available.",
            backHref,
          ),
          404,
        );
      }
      if (category === "conflict") {
        return context.html(
          renderDemoError(
            "Action not accepted",
            "The synthetic development action is no longer valid for the authoritative thread state or version.",
            backHref,
          ),
          409,
        );
      }
      if (category === "bad-request") {
        return context.html(
          renderDemoError(
            "Invalid synthetic request",
            "The submitted synthetic development data was not accepted.",
            backHref,
          ),
          400,
        );
      }
      return context.html(
        renderDemoError(
          "Development request failed",
          "The synthetic development request could not be completed.",
          backHref,
        ),
        500,
      );
    };

    app.get("/demo", (context) => context.html(renderDevelopmentLanding()));

    app.get("/demo/external", (context) =>
      context.html(renderExternalForm(demo.routingChoices)),
    );

    app.post("/demo/external", async (context) => {
      if (rejectCrossSitePost(context.req.raw)) {
        return context.html(
          renderDemoError(
            "Request rejected",
            "Synthetic mutation requests must originate from this development application.",
            "/demo/external",
          ),
          403,
        );
      }

      try {
        const form = await context.req.raw.formData();
        const routingCategory = form.get("routingCategory");
        const initialMessage = form.get("initialMessage");
        if (
          typeof routingCategory !== "string" ||
          typeof initialMessage !== "string"
        ) {
          return context.html(
            renderDemoError(
              "Invalid synthetic request",
              "Routing category and synthetic message are required.",
              "/demo/external",
            ),
            400,
          );
        }

        const at = demo.now();
        await demo.conversationService.initiateExternalExchange({
          deploymentId: demo.deploymentId,
          queueId: demo.queueId,
          routingCategory,
          threadId: demo.idGenerator.generate("thread"),
          externalParticipantRef: demo.idGenerator.generate(
            "external-participant",
          ),
          messageId: demo.idGenerator.generate("message"),
          initialMessage,
          threadCreatedAuditEventId: demo.idGenerator.generate("audit"),
          messageAuditEventId: demo.idGenerator.generate("audit"),
          at,
        });

        return context.redirect("/demo/external/confirmation", 303);
      } catch (error: unknown) {
        return renderMappedError(context, error, "/demo/external");
      }
    });

    app.get("/demo/external/confirmation", (context) =>
      context.html(renderExternalConfirmation()),
    );

    app.get("/demo/staff/queue", async (context) => {
      try {
        const candidates = await demo.conversationService.listQueueCandidates({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          queueId: demo.queueId,
        });
        return context.html(
          renderStaffQueue(candidates, demo.queueLabel, demo.staffContextLabel),
        );
      } catch (error: unknown) {
        return renderMappedError(context, error, "/demo");
      }
    });

    app.post("/demo/staff/threads/:threadId/open", async (context) => {
      if (rejectCrossSitePost(context.req.raw)) {
        return context.html(
          renderDemoError(
            "Request rejected",
            "Synthetic mutation requests must originate from this development application.",
            "/demo/staff/queue",
          ),
          403,
        );
      }

      const threadId = context.req.param("threadId");
      try {
        await demo.conversationService.openStaffConversation({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          at: demo.now(),
        });
        return context.redirect(
          `/demo/staff/threads/${encodeURIComponent(threadId)}`,
          303,
        );
      } catch (error: unknown) {
        return renderMappedError(context, error, "/demo/staff/queue");
      }
    });

    app.get("/demo/staff/threads/:threadId", async (context) => {
      const threadId = context.req.param("threadId");
      try {
        const conversation =
          await demo.conversationService.readStaffConversation({
            actor: demo.staffActor,
            deploymentId: demo.deploymentId,
            threadId,
          });
        return context.html(
          renderConversation(
            conversation,
            demo.staffContextLabel,
            isStaffReplyAllowed(conversation.thread.state),
          ),
        );
      } catch (error: unknown) {
        return renderMappedError(context, error, "/demo/staff/queue");
      }
    });

    app.post("/demo/staff/threads/:threadId/reply", async (context) => {
      if (rejectCrossSitePost(context.req.raw)) {
        return context.html(
          renderDemoError(
            "Request rejected",
            "Synthetic mutation requests must originate from this development application.",
            "/demo/staff/queue",
          ),
          403,
        );
      }

      const threadId = context.req.param("threadId");
      const backHref = `/demo/staff/threads/${encodeURIComponent(threadId)}`;
      try {
        const form = await context.req.raw.formData();
        const expectedVersion = parseExpectedVersion(
          form.get("expectedVersion"),
        );
        const messageBody = form.get("messageBody");
        if (expectedVersion === undefined || typeof messageBody !== "string") {
          return context.html(
            renderDemoError(
              "Invalid synthetic request",
              "A current expected version and synthetic reply are required.",
              backHref,
            ),
            400,
          );
        }

        await demo.conversationService.replyToConversation({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          expectedVersion,
          messageId: demo.idGenerator.generate("message"),
          messageBody,
          auditEventId: demo.idGenerator.generate("audit"),
          at: demo.now(),
        });
        return context.redirect(backHref, 303);
      } catch (error: unknown) {
        return renderMappedError(context, error, backHref);
      }
    });

    app.post("/demo/staff/threads/:threadId/start", async (context) => {
      if (rejectCrossSitePost(context.req.raw)) {
        return context.html(
          renderDemoError(
            "Request rejected",
            "Synthetic mutation requests must originate from this development application.",
            "/demo/staff/queue",
          ),
          403,
        );
      }

      const threadId = context.req.param("threadId");
      const backHref = `/demo/staff/threads/${encodeURIComponent(threadId)}`;
      try {
        const form = await context.req.raw.formData();
        const expectedVersion = parseExpectedVersion(
          form.get("expectedVersion"),
        );
        if (expectedVersion === undefined) {
          return context.html(
            renderDemoError(
              "Invalid synthetic request",
              "A current expected version is required.",
              backHref,
            ),
            400,
          );
        }

        await demo.workflowService.transitionThread({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          expectedVersion,
          targetState: "IN_PROGRESS",
          at: demo.now(),
        });
        return context.redirect(backHref, 303);
      } catch (error: unknown) {
        return renderMappedError(context, error, backHref);
      }
    });
  }

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((error, context) => {
    void error;
    return context.json({ error: "internal_error" }, 500);
  });

  return app;
}

export const app = createApp();
