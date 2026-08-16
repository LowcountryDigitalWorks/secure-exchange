import type { Context, Hono } from "hono";

import { ApplicationError } from "../application/errors.js";
import {
  SYNTHETIC_PATIENT_RECORD_DESTINATION,
  SyntheticCommercialWorkflowError,
  type SenderSuppliedMatchingEvidence,
  type SyntheticTransferSimulationOutcome,
} from "../adapters/synthetic-commercial-workflow.js";
import { DomainError } from "../domain/errors.js";
import type { AttachmentMediaCategory } from "../domain/index.js";
import {
  renderCommercialDiagnostics,
  renderCommercialError,
  renderCommercialIntake,
  renderCommercialQueue,
  renderCommercialSubmitted,
  renderCommercialThread,
} from "../web/commercial-development-page.js";
import { buildAttachmentContentDisposition } from "./external-retrieval-development.js";
import type { DevelopmentDemoRuntime } from "./development-demo.js";

export const COMMERCIAL_DEMO_ROUTE_PREFIX = "/demo/commercial";
const MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

const MEDIA_POLICY: Readonly<
  Record<
    string,
    {
      readonly extensions: readonly string[];
      readonly category: AttachmentMediaCategory;
    }
  >
> = {
  "application/pdf": { extensions: ["pdf"], category: "DOCUMENT" },
  "image/png": { extensions: ["png"], category: "IMAGE" },
  "image/jpeg": { extensions: ["jpg", "jpeg"], category: "IMAGE" },
  "text/plain": { extensions: ["txt"], category: "TEXT" },
};

interface PreparedUpload {
  readonly filename: string;
  readonly mediaType: string;
  readonly mediaCategory: AttachmentMediaCategory;
  readonly content: Uint8Array;
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

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function boundedString(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    hasControlCharacters(value)
  ) {
    return undefined;
  }
  return value;
}

function optionalEvidenceValue(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength || hasControlCharacters(trimmed)) {
    throw new SyntheticCommercialWorkflowError(
      "INVALID_PATIENT_QUERY",
      "Synthetic matching evidence is invalid.",
    );
  }
  return trimmed;
}

function extension(filename: string): string {
  const basename = filename.split(/[\\/]/u).at(-1) ?? "";
  const dot = basename.lastIndexOf(".");
  return dot <= 0 || dot === basename.length - 1
    ? ""
    : basename.slice(dot + 1).toLowerCase();
}

async function prepareUploads(
  form: FormData,
): Promise<readonly PreparedUpload[]> {
  const entries = form.getAll("attachments");
  if (entries.length === 0 || entries.length > MAX_ATTACHMENTS) {
    throw new ApplicationError(
      "ATTACHMENT_POLICY_REJECTED",
      "Synthetic commercial intake requires one to four attachments.",
    );
  }

  const uploads: PreparedUpload[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File)) {
      throw new ApplicationError(
        "ATTACHMENT_POLICY_REJECTED",
        "Synthetic commercial attachment input is invalid.",
      );
    }
    const mediaType = entry.type.trim().toLowerCase();
    const policy = MEDIA_POLICY[mediaType];
    if (
      policy === undefined ||
      entry.size <= 0 ||
      entry.size > MAX_ATTACHMENT_SIZE_BYTES ||
      !policy.extensions.includes(extension(entry.name))
    ) {
      throw new ApplicationError(
        "ATTACHMENT_POLICY_REJECTED",
        "Synthetic commercial attachment is outside the permitted type, extension, or size policy.",
      );
    }
    uploads.push({
      filename: entry.name,
      mediaType,
      mediaCategory: policy.category,
      content: new Uint8Array(await entry.arrayBuffer()),
    });
  }
  return uploads;
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

function statusForError(error: unknown): 400 | 403 | 404 | 409 | 500 {
  if (error instanceof SyntheticCommercialWorkflowError) {
    if (error.code === "THREAD_NOT_REGISTERED") {
      return 404;
    }
    if (
      error.code === "FILING_BLOCKED" ||
      error.code === "FILING_CONFIRMATION_NOT_AVAILABLE"
    ) {
      return 409;
    }
    return 400;
  }
  if (error instanceof ApplicationError) {
    if (
      error.code === "RESOURCE_NOT_FOUND" ||
      error.code === "ATTACHMENT_NOT_FOUND"
    ) {
      return 404;
    }
    if (error.code === "AUTHORIZATION_DENIED") {
      return 403;
    }
    if (
      error.code === "COMPLETION_PRECONDITION_FAILED" ||
      error.code === "ATTACHMENT_NOT_RETRIEVABLE" ||
      error.code === "CONTENT_NOT_AVAILABLE"
    ) {
      return 409;
    }
    return 400;
  }
  if (error instanceof DomainError) {
    return error.code === "STALE_VERSION" || error.code === "INVALID_TRANSITION"
      ? 409
      : 400;
  }
  return 500;
}

function commercialError(
  context: Context,
  error: unknown,
  backHref: string,
): Response {
  const status = statusForError(error);
  const title =
    status === 404
      ? "Synthetic work item unavailable"
      : status === 403
        ? "Synthetic action not authorized"
        : status === 409
          ? "Synthetic action not accepted"
          : status === 400
            ? "Invalid synthetic request"
            : "Synthetic demo request failed";
  return context.html(
    renderCommercialError(
      title,
      status === 500
        ? "The synthetic commercial demo request could not be completed."
        : "The synthetic commercial demo did not accept this request in its current authoritative state.",
      backHref,
    ),
    status,
  );
}

function crossSiteRejected(context: Context, backHref: string): Response {
  return context.html(
    renderCommercialError(
      "Request rejected",
      "Synthetic mutation requests must originate from this development application.",
      backHref,
    ),
    403,
  );
}

async function requireCommercialThread(
  demo: DevelopmentDemoRuntime,
  threadId: string,
): Promise<void> {
  demo.commercialWorkflow.getThreadState(threadId);
  const thread = await demo.store.getThread(demo.deploymentId, threadId);
  if (thread?.deploymentId !== demo.deploymentId) {
    throw new ApplicationError(
      "RESOURCE_NOT_FOUND",
      "Synthetic commercial thread is not available.",
    );
  }
}

function threadHref(threadId: string): string {
  return `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/${encodeURIComponent(threadId)}`;
}

function setContentHeaders(
  context: Context,
  mediaType: string,
  byteLength: number,
): void {
  context.header("Content-Type", mediaType);
  context.header("Content-Length", String(byteLength));
  context.header("Cache-Control", "no-store, private");
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
  context.header("Cross-Origin-Resource-Policy", "same-origin");
}

export function registerCommercialDevelopmentRoutes(
  app: Hono,
  demo: DevelopmentDemoRuntime,
): void {
  app.get(COMMERCIAL_DEMO_ROUTE_PREFIX, (context) =>
    context.html(renderCommercialIntake(demo.routingChoices)),
  );

  app.post(`${COMMERCIAL_DEMO_ROUTE_PREFIX}/intake`, async (context) => {
    if (!isSameOriginPost(context.req.raw)) {
      return crossSiteRejected(context, COMMERCIAL_DEMO_ROUTE_PREFIX);
    }
    try {
      const form = await context.req.raw.formData();
      const routingCategory = boundedString(form.get("routingCategory"), 64);
      const initialMessage = boundedString(form.get("initialMessage"), 8_000);
      if (routingCategory === undefined || initialMessage === undefined) {
        throw new ApplicationError(
          "ROUTING_NOT_AVAILABLE",
          "Synthetic routing and message are required.",
        );
      }
      const syntheticName = optionalEvidenceValue(
        form.get("syntheticName"),
        80,
      );
      const syntheticDateOfBirth = optionalEvidenceValue(
        form.get("syntheticDob"),
        10,
      );
      if (
        syntheticDateOfBirth !== undefined &&
        !/^\d{4}-\d{2}-\d{2}$/u.test(syntheticDateOfBirth)
      ) {
        throw new SyntheticCommercialWorkflowError(
          "INVALID_PATIENT_QUERY",
          "Synthetic date of birth must use YYYY-MM-DD.",
        );
      }
      const uploads = await prepareUploads(form);
      const at = demo.now();
      const threadId = demo.idGenerator.generate("thread");
      const messageId = demo.idGenerator.generate("message");
      await demo.conversationService.initiateExternalExchange({
        deploymentId: demo.deploymentId,
        queueId: demo.queueId,
        routingCategory,
        threadId,
        externalParticipantRef: demo.idGenerator.generate(
          "external-participant",
        ),
        messageId,
        initialMessage,
        threadCreatedAuditEventId: demo.idGenerator.generate("audit"),
        messageAuditEventId: demo.idGenerator.generate("audit"),
        at,
      });

      for (const upload of uploads) {
        const attachment = await demo.attachmentService.ingestAttachment({
          deploymentId: demo.deploymentId,
          threadId,
          messageId,
          originalDisplayFilename: upload.filename,
          declaredMediaCategory: upload.mediaCategory,
          declaredMediaType: upload.mediaType,
          content: upload.content,
          at,
        });
        await demo.attachmentService.recordScanResult({
          deploymentId: demo.deploymentId,
          threadId,
          messageId,
          attachmentId: attachment.attachmentId,
          scanResultRef: `synthetic-clean-${attachment.attachmentId}`.slice(
            0,
            128,
          ),
          outcome: "CLEAN",
          at,
        });
      }

      const candidates =
        await demo.attachmentService.listStaffAttachmentCandidates({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
        });
      const senderEvidence: SenderSuppliedMatchingEvidence = {
        ...(syntheticName === undefined ? {} : { syntheticName }),
        ...(syntheticDateOfBirth === undefined ? {} : { syntheticDateOfBirth }),
      };
      demo.commercialWorkflow.registerIntake(
        threadId,
        senderEvidence,
        candidates,
      );
      return context.redirect(`${COMMERCIAL_DEMO_ROUTE_PREFIX}/submitted`, 303);
    } catch (error: unknown) {
      return commercialError(context, error, COMMERCIAL_DEMO_ROUTE_PREFIX);
    }
  });

  app.get(`${COMMERCIAL_DEMO_ROUTE_PREFIX}/submitted`, (context) =>
    context.html(renderCommercialSubmitted()),
  );

  app.get(`${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/queue`, async (context) => {
    try {
      const candidates = await demo.conversationService.listQueueCandidates({
        actor: demo.staffActor,
        deploymentId: demo.deploymentId,
        queueId: demo.queueId,
      });
      const commercialCandidates = candidates.filter((candidate) => {
        try {
          demo.commercialWorkflow.getThreadState(candidate.threadId);
          return true;
        } catch {
          return false;
        }
      });
      return context.html(renderCommercialQueue(commercialCandidates));
    } catch (error: unknown) {
      return commercialError(context, error, COMMERCIAL_DEMO_ROUTE_PREFIX);
    }
  });

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/open`,
    async (context) => {
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(
          context,
          `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/queue`,
        );
      }
      const threadId = context.req.param("threadId");
      try {
        await requireCommercialThread(demo, threadId);
        await demo.conversationService.openStaffConversation({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          at: demo.now(),
        });
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(
          context,
          error,
          `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/queue`,
        );
      }
    },
  );

  app.get(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId`,
    async (context) => {
      const threadId = context.req.param("threadId");
      try {
        await requireCommercialThread(demo, threadId);
        const conversation =
          await demo.conversationService.readStaffConversation({
            actor: demo.staffActor,
            deploymentId: demo.deploymentId,
            threadId,
          });
        const candidates =
          await demo.attachmentService.listStaffAttachmentCandidates({
            actor: demo.staffActor,
            deploymentId: demo.deploymentId,
            threadId,
          });
        return context.html(
          renderCommercialThread(
            conversation,
            candidates,
            demo.commercialWorkflow.getThreadState(threadId),
          ),
        );
      } catch (error: unknown) {
        return commercialError(
          context,
          error,
          `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/queue`,
        );
      }
    },
  );

  app.get(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/preview/:messageId/:attachmentId`,
    async (context) => {
      const threadId = context.req.param("threadId");
      try {
        await requireCommercialThread(demo, threadId);
        const result = await demo.attachmentService.previewStaffAttachment({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          messageId: context.req.param("messageId"),
          attachmentId: context.req.param("attachmentId"),
        });
        if (
          result.normalizedMediaType !== "image/png" &&
          result.normalizedMediaType !== "image/jpeg" &&
          result.normalizedMediaType !== "application/pdf"
        ) {
          return context.html(
            renderCommercialError(
              "No inline preview",
              "This supported synthetic attachment type uses bounded metadata plus the explicit manual-download fallback instead of a universal renderer.",
              threadHref(threadId),
            ),
            415,
          );
        }
        setContentHeaders(
          context,
          result.normalizedMediaType,
          result.byteLength,
        );
        return context.body(Uint8Array.from(result.content).buffer);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/download`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const form = await context.req.raw.formData();
        const messageId = boundedString(form.get("messageId"), 256);
        const attachmentId = boundedString(form.get("attachmentId"), 256);
        if (messageId === undefined || attachmentId === undefined) {
          throw new ApplicationError(
            "ATTACHMENT_NOT_FOUND",
            "Synthetic attachment reference is invalid.",
          );
        }
        const result = await demo.attachmentService.retrieveStaffAttachment({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          messageId,
          attachmentId,
          at: demo.now(),
        });
        demo.commercialWorkflow.recordManualDownloadFallback(threadId);
        setContentHeaders(
          context,
          result.normalizedMediaType,
          result.byteLength,
        );
        context.header(
          "Content-Disposition",
          buildAttachmentContentDisposition(result.safeDownloadFilename),
        );
        return context.body(Uint8Array.from(result.content).buffer);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/patient/verify-number`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const patientNumber = boundedString(
          (await context.req.raw.formData()).get("patientNumber"),
          32,
        );
        if (patientNumber === undefined) {
          throw new SyntheticCommercialWorkflowError(
            "INVALID_PATIENT_QUERY",
            "Synthetic patient number is required.",
          );
        }
        demo.commercialWorkflow.verifyPatientNumber(threadId, patientNumber);
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/patient/search`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const form = await context.req.raw.formData();
        const name = boundedString(form.get("searchName"), 80);
        const dob = boundedString(form.get("searchDob"), 10);
        if (name === undefined || dob === undefined) {
          throw new SyntheticCommercialWorkflowError(
            "INVALID_PATIENT_QUERY",
            "Synthetic patient search values are required.",
          );
        }
        demo.commercialWorkflow.searchPatients(threadId, name, dob);
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/patient/select`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const patientNumber = boundedString(
          (await context.req.raw.formData()).get("patientNumber"),
          32,
        );
        if (patientNumber === undefined) {
          throw new SyntheticCommercialWorkflowError(
            "PATIENT_NOT_SELECTABLE",
            "Synthetic patient selection is invalid.",
          );
        }
        demo.commercialWorkflow.confirmPatient(threadId, patientNumber);
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/patient/not-found`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        demo.commercialWorkflow.markPatientNotFound(threadId);
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/mapping`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const form = await context.req.raw.formData();
        const attachmentId = boundedString(form.get("attachmentId"), 256);
        const destination = boundedString(form.get("destination"), 64);
        const classification = boundedString(form.get("classification"), 64);
        if (
          attachmentId === undefined ||
          destination === undefined ||
          classification === undefined
        ) {
          throw new SyntheticCommercialWorkflowError(
            "INVALID_MAPPING",
            "Synthetic filing mapping is invalid.",
          );
        }
        demo.commercialWorkflow.saveMapping(
          threadId,
          attachmentId,
          destination,
          classification,
        );
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/simulate`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const outcome = (await context.req.raw.formData()).get("outcome");
        if (outcome !== "SUCCESS" && outcome !== "FAILURE") {
          throw new SyntheticCommercialWorkflowError(
            "FILING_BLOCKED",
            "Synthetic downstream outcome is invalid.",
          );
        }
        demo.commercialWorkflow.simulateTransfer(
          threadId,
          outcome as SyntheticTransferSimulationOutcome,
        );
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/confirm-filing`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      let reserved = false;
      try {
        await requireCommercialThread(demo, threadId);
        reserved = demo.commercialWorkflow.reserveFilingConfirmation(threadId);
        if (!reserved) {
          throw new SyntheticCommercialWorkflowError(
            "FILING_CONFIRMATION_NOT_AVAILABLE",
            "Synthetic filing confirmation is not available.",
          );
        }
        const attestationId = demo.idGenerator.generate("audit");
        await demo.workflowService.appendTransferAttestation({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          attestationId,
          at: demo.now(),
          outcome: "FILED",
          destinationCategory: SYNTHETIC_PATIENT_RECORD_DESTINATION,
        });
        demo.commercialWorkflow.completeFilingConfirmation(
          threadId,
          attestationId,
        );
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        if (reserved) {
          demo.commercialWorkflow.cancelFilingConfirmation(threadId);
        }
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/complete`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const expectedVersion = parseExpectedVersion(
          (await context.req.raw.formData()).get("expectedVersion"),
        );
        if (expectedVersion === undefined) {
          throw new DomainError(
            "STALE_VERSION",
            "Expected thread version is invalid.",
          );
        }
        await demo.workflowService.completeThread({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          expectedVersion,
          at: demo.now(),
        });
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.post(
    `${COMMERCIAL_DEMO_ROUTE_PREFIX}/staff/threads/:threadId/dispose`,
    async (context) => {
      const threadId = context.req.param("threadId");
      if (!isSameOriginPost(context.req.raw)) {
        return crossSiteRejected(context, threadHref(threadId));
      }
      try {
        await requireCommercialThread(demo, threadId);
        const expectedVersion = parseExpectedVersion(
          (await context.req.raw.formData()).get("expectedVersion"),
        );
        if (expectedVersion === undefined) {
          throw new DomainError(
            "STALE_VERSION",
            "Expected thread version is invalid.",
          );
        }
        await demo.workflowService.transitionThread({
          actor: demo.staffActor,
          deploymentId: demo.deploymentId,
          threadId,
          auditEventId: demo.idGenerator.generate("audit"),
          expectedVersion,
          targetState: "DISPOSED",
          at: demo.now(),
        });
        return context.redirect(threadHref(threadId), 303);
      } catch (error: unknown) {
        return commercialError(context, error, threadHref(threadId));
      }
    },
  );

  app.get(`${COMMERCIAL_DEMO_ROUTE_PREFIX}/admin/diagnostics`, (context) =>
    context.html(
      renderCommercialDiagnostics(
        demo.commercialWorkflow.getDiagnostics(),
        demo.commercialWorkflow.getNotifications(),
      ),
    ),
  );
}
