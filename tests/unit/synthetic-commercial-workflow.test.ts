import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_PATIENT_FIXTURES,
  SyntheticCommercialWorkflow,
  SyntheticCommercialWorkflowError,
} from "../../src/adapters/synthetic-commercial-workflow.js";
import type { StaffAttachmentCandidate } from "../../src/application/attachment-service.js";

const THREAD = "synthetic-commercial-thread";

function attachment(
  overrides: Partial<StaffAttachmentCandidate> = {},
): StaffAttachmentCandidate {
  return {
    messageId: "message-a",
    attachmentId: "attachment-a",
    safeDownloadFilename: "synthetic-record.pdf",
    normalizedMediaType: "application/pdf",
    normalizedMediaCategory: "DOCUMENT",
    byteLength: 128,
    safetyState: "CLEAN",
    ...overrides,
  };
}

function workflow(): SyntheticCommercialWorkflow {
  const instance = new SyntheticCommercialWorkflow();
  instance.registerIntake(
    THREAD,
    {
      syntheticName: "Synthetic Avery Example",
      syntheticDateOfBirth: "1985-01-02",
    },
    [attachment()],
  );
  return instance;
}

function expectWorkflowCode(
  action: () => unknown,
  code: SyntheticCommercialWorkflowError["code"],
): void {
  try {
    action();
    throw new Error("Expected synthetic commercial workflow error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SyntheticCommercialWorkflowError);
    expect((error as SyntheticCommercialWorkflowError).code).toBe(code);
  }
}

describe("synthetic commercial workflow adapter", () => {
  it("verifies only fixed synthetic patient numbers and still requires explicit selection", () => {
    const instance = workflow();
    const patient = SYNTHETIC_PATIENT_FIXTURES[0];

    expect(instance.verifyPatientNumber(THREAD, patient.patientNumber)).toEqual(
      patient,
    );
    expect(instance.getThreadState(THREAD)).toMatchObject({
      patientResolutionStatus: "CANDIDATES",
      confirmedPatient: undefined,
    });
    expectWorkflowCode(
      () => instance.confirmPatient(THREAD, "DEMO-INVENTED"),
      "PATIENT_NOT_SELECTABLE",
    );

    expect(instance.confirmPatient(THREAD, patient.patientNumber)).toEqual(
      patient,
    );
    expect(instance.getThreadState(THREAD)).toMatchObject({
      patientResolutionStatus: "CONFIRMED",
      confirmedPatient: patient,
    });
    expect(instance.getDiagnostics().patient_number_verified).toBe(1);
  });

  it("searches fixed name plus DOB fixtures without auto-selecting and supports explicit not-found state", () => {
    const instance = workflow();
    const patient = SYNTHETIC_PATIENT_FIXTURES[1];
    const matches = instance.searchPatients(
      THREAD,
      "Jordan Example",
      patient.dateOfBirth,
    );

    expect(matches).toEqual([patient]);
    expect(instance.getThreadState(THREAD)).toMatchObject({
      patientResolutionStatus: "CANDIDATES",
      confirmedPatient: undefined,
    });
    instance.confirmPatient(THREAD, patient.patientNumber);
    expect(instance.getDiagnostics().patient_search_selected).toBe(1);

    instance.markPatientNotFound(THREAD);
    expect(instance.getThreadState(THREAD)).toMatchObject({
      patientResolutionStatus: "NOT_FOUND",
      confirmedPatient: undefined,
    });
    expect(instance.getDiagnostics().patient_not_found_selected).toBe(1);
    expectWorkflowCode(
      () => instance.simulateTransfer(THREAD, "SUCCESS"),
      "FILING_BLOCKED",
    );
  });

  it("persists only allowlisted demo mapping corrections and increments fixed counters", () => {
    const instance = workflow();
    const initial = instance.getThreadState(THREAD).filingMappings[0];
    expect(initial).toMatchObject({
      destination: "PATIENT_DOCUMENTS",
      classification: "DOCUMENT",
    });

    const corrected = instance.saveMapping(
      THREAD,
      "attachment-a",
      "PATIENT_IMAGES",
      "IMAGE",
    );
    expect(corrected).toMatchObject({
      destination: "PATIENT_IMAGES",
      classification: "IMAGE",
    });
    expect(instance.getDiagnostics()).toMatchObject({
      proposed_category_corrected: 1,
      proposed_classification_corrected: 1,
      filing_preview_changed: 1,
    });

    expectWorkflowCode(
      () =>
        instance.saveMapping(
          THREAD,
          "attachment-a",
          "INJECTED_DESTINATION",
          "DOCUMENT",
        ),
      "INVALID_MAPPING",
    );
  });

  it("keeps deterministic simulation separate from explicit filing confirmation and prevents replay", () => {
    const instance = workflow();
    const patient = SYNTHETIC_PATIENT_FIXTURES[0];
    instance.verifyPatientNumber(THREAD, patient.patientNumber);
    instance.confirmPatient(THREAD, patient.patientNumber);

    expect(instance.simulateTransfer(THREAD, "FAILURE")).toBe("FAILURE");
    expect(instance.getThreadState(THREAD).filedAttestationId).toBeUndefined();
    expect(instance.simulateTransfer(THREAD, "SUCCESS")).toBe("SUCCESS");
    expect(instance.getDiagnostics()).toMatchObject({
      synthetic_transfer_failed: 1,
      synthetic_transfer_retried: 1,
    });
    expect(instance.getThreadState(THREAD).filedAttestationId).toBeUndefined();

    expect(instance.reserveFilingConfirmation(THREAD)).toBe(true);
    expect(instance.reserveFilingConfirmation(THREAD)).toBe(false);
    instance.completeFilingConfirmation(THREAD, "attestation-synthetic-1");
    expect(instance.getThreadState(THREAD).filedAttestationId).toBe(
      "attestation-synthetic-1",
    );
    expect(instance.reserveFilingConfirmation(THREAD)).toBe(false);
  });

  it("serializes diagnostics as fixed counter names and numbers only", () => {
    const instance = workflow();
    instance.recordManualDownloadFallback(THREAD);
    const diagnostics = instance.getDiagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(Object.keys(diagnostics).sort()).toEqual(
      [
        "patient_number_verified",
        "patient_search_selected",
        "patient_not_found_selected",
        "proposed_category_corrected",
        "proposed_classification_corrected",
        "filing_preview_changed",
        "synthetic_transfer_failed",
        "synthetic_transfer_retried",
        "manual_download_fallback_used",
      ].sort(),
    );
    expect(Object.values(diagnostics).every(Number.isSafeInteger)).toBe(true);
    expect(serialized).not.toContain("Synthetic Avery Example");
    expect(serialized).not.toContain("1985-01-02");
    expect(serialized).not.toContain("DEMO-1001");
    expect(serialized).not.toContain("synthetic-record.pdf");
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("attachment bytes");
  });

  it("records only the fixed non-sensitive synthetic notification representation", () => {
    const instance = workflow();
    expect(instance.getNotifications()).toEqual([
      { message: "A secure exchange item is available." },
    ]);
    expect(JSON.stringify(instance.getNotifications())).not.toContain(
      "Synthetic Avery Example",
    );
  });
});
