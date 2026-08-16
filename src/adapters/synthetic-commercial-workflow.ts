import type { StaffAttachmentCandidate } from "../application/attachment-service.js";

export const SYNTHETIC_PATIENT_RECORD_DESTINATION = "SYNTHETIC_PATIENT_RECORD";

export const SYNTHETIC_PATIENT_FIXTURES = [
  {
    patientNumber: "DEMO-1001",
    displayName: "Synthetic Avery Example",
    dateOfBirth: "1985-01-02",
  },
  {
    patientNumber: "DEMO-1002",
    displayName: "Synthetic Jordan Example",
    dateOfBirth: "1990-06-15",
  },
  {
    patientNumber: "DEMO-1003",
    displayName: "Synthetic Morgan Example",
    dateOfBirth: "1978-11-21",
  },
] as const;

export const SYNTHETIC_FILING_DESTINATIONS = [
  { value: "PATIENT_DOCUMENTS", label: "Synthetic patient documents" },
  { value: "PATIENT_IMAGES", label: "Synthetic patient images" },
  { value: "PATIENT_CORRESPONDENCE", label: "Synthetic correspondence" },
] as const;

export const SYNTHETIC_FILING_CLASSIFICATIONS = [
  { value: "DOCUMENT", label: "Document" },
  { value: "RADIOGRAPH", label: "Synthetic radiograph" },
  { value: "IMAGE", label: "Image" },
  { value: "TEXT_NOTE", label: "Text note" },
] as const;

export type SyntheticFilingDestination =
  (typeof SYNTHETIC_FILING_DESTINATIONS)[number]["value"];
export type SyntheticFilingClassification =
  (typeof SYNTHETIC_FILING_CLASSIFICATIONS)[number]["value"];

export type SyntheticDiagnosticCounterKey =
  | "patient_number_verified"
  | "patient_search_selected"
  | "patient_not_found_selected"
  | "proposed_category_corrected"
  | "proposed_classification_corrected"
  | "filing_preview_changed"
  | "synthetic_transfer_failed"
  | "synthetic_transfer_retried"
  | "manual_download_fallback_used";

const DIAGNOSTIC_KEYS: readonly SyntheticDiagnosticCounterKey[] = [
  "patient_number_verified",
  "patient_search_selected",
  "patient_not_found_selected",
  "proposed_category_corrected",
  "proposed_classification_corrected",
  "filing_preview_changed",
  "synthetic_transfer_failed",
  "synthetic_transfer_retried",
  "manual_download_fallback_used",
];

export interface SyntheticPatientFixture {
  readonly patientNumber: string;
  readonly displayName: string;
  readonly dateOfBirth: string;
}

export interface SenderSuppliedMatchingEvidence {
  readonly syntheticName?: string;
  readonly syntheticDateOfBirth?: string;
}

export interface SyntheticFilingMapping {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly safeDownloadFilename: string;
  readonly destination: SyntheticFilingDestination;
  readonly classification: SyntheticFilingClassification;
  readonly description: string;
  readonly syntheticLocationMetadata?: string;
}

export type SyntheticPatientResolutionStatus =
  "UNRESOLVED" | "CANDIDATES" | "CONFIRMED" | "NOT_FOUND";
export type SyntheticTransferSimulationOutcome = "SUCCESS" | "FAILURE";

type PatientCandidateSource = "NUMBER" | "SEARCH";

export interface SyntheticCommercialThreadState {
  readonly threadId: string;
  readonly senderEvidence: SenderSuppliedMatchingEvidence;
  readonly patientResolutionStatus: SyntheticPatientResolutionStatus;
  readonly patientCandidates: readonly SyntheticPatientFixture[];
  readonly confirmedPatient?: SyntheticPatientFixture;
  readonly filingMappings: readonly SyntheticFilingMapping[];
  readonly simulatedTransferOutcome?: SyntheticTransferSimulationOutcome;
  readonly filingConfirmationPending: boolean;
  readonly filedAttestationId?: string;
}

interface MutableCommercialThreadState {
  readonly threadId: string;
  readonly senderEvidence: SenderSuppliedMatchingEvidence;
  patientResolutionStatus: SyntheticPatientResolutionStatus;
  patientCandidateNumbers: string[];
  patientCandidateSource?: PatientCandidateSource;
  confirmedPatientNumber?: string;
  filingMappings: SyntheticFilingMapping[];
  simulatedTransferOutcome?: SyntheticTransferSimulationOutcome;
  filingConfirmationPending: boolean;
  filedAttestationId?: string;
}

export interface SyntheticNotification {
  readonly message: "A secure exchange item is available.";
}

export type SyntheticCommercialWorkflowErrorCode =
  | "THREAD_NOT_REGISTERED"
  | "INVALID_PATIENT_QUERY"
  | "PATIENT_NOT_SELECTABLE"
  | "INVALID_MAPPING"
  | "FILING_BLOCKED"
  | "FILING_CONFIRMATION_NOT_AVAILABLE";

export class SyntheticCommercialWorkflowError extends Error {
  constructor(
    public readonly code: SyntheticCommercialWorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyntheticCommercialWorkflowError";
  }
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function validDob(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function fixtureByNumber(value: string): SyntheticPatientFixture | undefined {
  return SYNTHETIC_PATIENT_FIXTURES.find(
    (patient) => patient.patientNumber === value,
  );
}

function copyPatient(
  patient: SyntheticPatientFixture,
): SyntheticPatientFixture {
  return { ...patient };
}

function defaultMapping(
  candidate: StaffAttachmentCandidate,
): SyntheticFilingMapping {
  if (candidate.normalizedMediaCategory === "IMAGE") {
    return {
      messageId: candidate.messageId,
      attachmentId: candidate.attachmentId,
      safeDownloadFilename: candidate.safeDownloadFilename,
      destination: "PATIENT_IMAGES",
      classification:
        candidate.normalizedMediaType === "image/jpeg" ? "RADIOGRAPH" : "IMAGE",
      description: "Synthetic image record",
      syntheticLocationMetadata: "Synthetic location: not assigned",
    };
  }
  if (candidate.normalizedMediaCategory === "TEXT") {
    return {
      messageId: candidate.messageId,
      attachmentId: candidate.attachmentId,
      safeDownloadFilename: candidate.safeDownloadFilename,
      destination: "PATIENT_CORRESPONDENCE",
      classification: "TEXT_NOTE",
      description: "Synthetic text record",
    };
  }
  return {
    messageId: candidate.messageId,
    attachmentId: candidate.attachmentId,
    safeDownloadFilename: candidate.safeDownloadFilename,
    destination: "PATIENT_DOCUMENTS",
    classification: "DOCUMENT",
    description: "Synthetic document record",
  };
}

export class SyntheticCommercialWorkflow {
  private readonly states = new Map<string, MutableCommercialThreadState>();
  private readonly diagnostics = new Map<SyntheticDiagnosticCounterKey, number>(
    DIAGNOSTIC_KEYS.map((key) => [key, 0]),
  );
  private readonly notifications: SyntheticNotification[] = [];

  registerIntake(
    threadId: string,
    senderEvidence: SenderSuppliedMatchingEvidence,
    attachments: readonly StaffAttachmentCandidate[],
  ): void {
    if (this.states.has(threadId)) {
      throw new SyntheticCommercialWorkflowError(
        "THREAD_NOT_REGISTERED",
        "Synthetic commercial thread state is already registered.",
      );
    }
    this.states.set(threadId, {
      threadId,
      senderEvidence: { ...senderEvidence },
      patientResolutionStatus: "UNRESOLVED",
      patientCandidateNumbers: [],
      filingMappings: attachments.map(defaultMapping),
      filingConfirmationPending: false,
    });
    this.notifications.push({
      message: "A secure exchange item is available.",
    });
  }

  getThreadState(threadId: string): SyntheticCommercialThreadState {
    const state = this.requireState(threadId);
    return {
      threadId: state.threadId,
      senderEvidence: { ...state.senderEvidence },
      patientResolutionStatus: state.patientResolutionStatus,
      patientCandidates: state.patientCandidateNumbers
        .map((patientNumber) => fixtureByNumber(patientNumber))
        .filter(
          (patient): patient is SyntheticPatientFixture =>
            patient !== undefined,
        )
        .map(copyPatient),
      ...(state.confirmedPatientNumber === undefined
        ? {}
        : {
            confirmedPatient: copyPatient(
              this.requireFixture(state.confirmedPatientNumber),
            ),
          }),
      filingMappings: state.filingMappings.map((mapping) => ({ ...mapping })),
      ...(state.simulatedTransferOutcome === undefined
        ? {}
        : { simulatedTransferOutcome: state.simulatedTransferOutcome }),
      filingConfirmationPending: state.filingConfirmationPending,
      ...(state.filedAttestationId === undefined
        ? {}
        : { filedAttestationId: state.filedAttestationId }),
    };
  }

  verifyPatientNumber(
    threadId: string,
    patientNumber: string,
  ): SyntheticPatientFixture | undefined {
    const state = this.requireState(threadId);
    const normalized = patientNumber.trim();
    if (normalized.length === 0 || normalized.length > 32) {
      throw new SyntheticCommercialWorkflowError(
        "INVALID_PATIENT_QUERY",
        "Synthetic patient number query is invalid.",
      );
    }
    const patient = fixtureByNumber(normalized);
    state.confirmedPatientNumber = undefined;
    state.patientCandidateSource = "NUMBER";
    state.patientCandidateNumbers =
      patient === undefined ? [] : [patient.patientNumber];
    state.patientResolutionStatus =
      patient === undefined ? "UNRESOLVED" : "CANDIDATES";
    if (patient !== undefined) {
      this.increment("patient_number_verified");
      return copyPatient(patient);
    }
    return undefined;
  }

  searchPatients(
    threadId: string,
    name: string,
    dateOfBirth: string,
  ): readonly SyntheticPatientFixture[] {
    const state = this.requireState(threadId);
    const normalized = normalizedName(name);
    const dob = dateOfBirth.trim();
    if (normalized.length === 0 || normalized.length > 80 || !validDob(dob)) {
      throw new SyntheticCommercialWorkflowError(
        "INVALID_PATIENT_QUERY",
        "Synthetic patient search requires bounded name and YYYY-MM-DD date of birth.",
      );
    }
    const matches = SYNTHETIC_PATIENT_FIXTURES.filter(
      (patient) =>
        normalizedName(patient.displayName).includes(normalized) &&
        patient.dateOfBirth === dob,
    );
    state.confirmedPatientNumber = undefined;
    state.patientCandidateSource = "SEARCH";
    state.patientCandidateNumbers = matches.map(
      (patient) => patient.patientNumber,
    );
    state.patientResolutionStatus =
      matches.length === 0 ? "UNRESOLVED" : "CANDIDATES";
    return matches.map(copyPatient);
  }

  confirmPatient(
    threadId: string,
    patientNumber: string,
  ): SyntheticPatientFixture {
    const state = this.requireState(threadId);
    if (!state.patientCandidateNumbers.includes(patientNumber)) {
      throw new SyntheticCommercialWorkflowError(
        "PATIENT_NOT_SELECTABLE",
        "Synthetic patient candidate is not selectable for this thread.",
      );
    }
    const patient = this.requireFixture(patientNumber);
    state.confirmedPatientNumber = patient.patientNumber;
    state.patientResolutionStatus = "CONFIRMED";
    if (state.patientCandidateSource === "SEARCH") {
      this.increment("patient_search_selected");
    }
    state.patientCandidateNumbers = [];
    state.patientCandidateSource = undefined;
    return copyPatient(patient);
  }

  markPatientNotFound(threadId: string): void {
    const state = this.requireState(threadId);
    state.patientResolutionStatus = "NOT_FOUND";
    state.patientCandidateNumbers = [];
    state.patientCandidateSource = undefined;
    state.confirmedPatientNumber = undefined;
    state.simulatedTransferOutcome = undefined;
    state.filingConfirmationPending = false;
    this.increment("patient_not_found_selected");
  }

  saveMapping(
    threadId: string,
    attachmentId: string,
    destination: string,
    classification: string,
  ): SyntheticFilingMapping {
    const state = this.requireState(threadId);
    const allowedDestination = SYNTHETIC_FILING_DESTINATIONS.some(
      (choice) => choice.value === destination,
    );
    const allowedClassification = SYNTHETIC_FILING_CLASSIFICATIONS.some(
      (choice) => choice.value === classification,
    );
    if (!allowedDestination || !allowedClassification) {
      throw new SyntheticCommercialWorkflowError(
        "INVALID_MAPPING",
        "Synthetic filing mapping is outside the server-side allowlist.",
      );
    }
    const index = state.filingMappings.findIndex(
      (mapping) => mapping.attachmentId === attachmentId,
    );
    const current = state.filingMappings[index];
    if (index < 0 || current === undefined) {
      throw new SyntheticCommercialWorkflowError(
        "INVALID_MAPPING",
        "Synthetic attachment mapping was not found.",
      );
    }

    const categoryChanged = current.destination !== destination;
    const classificationChanged = current.classification !== classification;
    const next: SyntheticFilingMapping = {
      ...current,
      destination: destination as SyntheticFilingDestination,
      classification: classification as SyntheticFilingClassification,
    };
    state.filingMappings[index] = next;
    if (categoryChanged) {
      this.increment("proposed_category_corrected");
    }
    if (classificationChanged) {
      this.increment("proposed_classification_corrected");
    }
    if (categoryChanged || classificationChanged) {
      this.increment("filing_preview_changed");
    }
    return { ...next };
  }

  simulateTransfer(
    threadId: string,
    outcome: SyntheticTransferSimulationOutcome,
  ): SyntheticTransferSimulationOutcome {
    const state = this.requireReadyForTransfer(threadId);
    if (state.simulatedTransferOutcome === "FAILURE") {
      this.increment("synthetic_transfer_retried");
    }
    state.simulatedTransferOutcome = outcome;
    state.filingConfirmationPending = false;
    if (outcome === "FAILURE") {
      this.increment("synthetic_transfer_failed");
    }
    return outcome;
  }

  reserveFilingConfirmation(threadId: string): boolean {
    const state = this.requireReadyForTransfer(threadId);
    if (
      state.simulatedTransferOutcome !== "SUCCESS" ||
      state.filedAttestationId !== undefined ||
      state.filingConfirmationPending
    ) {
      return false;
    }
    state.filingConfirmationPending = true;
    return true;
  }

  completeFilingConfirmation(threadId: string, attestationId: string): void {
    const state = this.requireState(threadId);
    if (!state.filingConfirmationPending || attestationId.length === 0) {
      throw new SyntheticCommercialWorkflowError(
        "FILING_CONFIRMATION_NOT_AVAILABLE",
        "Synthetic filing confirmation was not reserved.",
      );
    }
    state.filingConfirmationPending = false;
    state.filedAttestationId = attestationId;
  }

  cancelFilingConfirmation(threadId: string): void {
    const state = this.requireState(threadId);
    state.filingConfirmationPending = false;
  }

  recordManualDownloadFallback(threadId: string): void {
    this.requireState(threadId);
    this.increment("manual_download_fallback_used");
  }

  getDiagnostics(): Readonly<Record<SyntheticDiagnosticCounterKey, number>> {
    return {
      patient_number_verified: this.count("patient_number_verified"),
      patient_search_selected: this.count("patient_search_selected"),
      patient_not_found_selected: this.count("patient_not_found_selected"),
      proposed_category_corrected: this.count("proposed_category_corrected"),
      proposed_classification_corrected: this.count(
        "proposed_classification_corrected",
      ),
      filing_preview_changed: this.count("filing_preview_changed"),
      synthetic_transfer_failed: this.count("synthetic_transfer_failed"),
      synthetic_transfer_retried: this.count("synthetic_transfer_retried"),
      manual_download_fallback_used: this.count(
        "manual_download_fallback_used",
      ),
    };
  }

  getNotifications(): readonly SyntheticNotification[] {
    return this.notifications.map((notification) => ({ ...notification }));
  }

  private requireReadyForTransfer(
    threadId: string,
  ): MutableCommercialThreadState {
    const state = this.requireState(threadId);
    if (
      state.patientResolutionStatus !== "CONFIRMED" ||
      state.confirmedPatientNumber === undefined ||
      state.filingMappings.length === 0
    ) {
      throw new SyntheticCommercialWorkflowError(
        "FILING_BLOCKED",
        "Synthetic downstream filing is blocked until a fixture patient is explicitly confirmed.",
      );
    }
    return state;
  }

  private requireState(threadId: string): MutableCommercialThreadState {
    const state = this.states.get(threadId);
    if (state === undefined) {
      throw new SyntheticCommercialWorkflowError(
        "THREAD_NOT_REGISTERED",
        "Synthetic commercial thread state was not found.",
      );
    }
    return state;
  }

  private requireFixture(patientNumber: string): SyntheticPatientFixture {
    const patient = fixtureByNumber(patientNumber);
    if (patient === undefined) {
      throw new SyntheticCommercialWorkflowError(
        "PATIENT_NOT_SELECTABLE",
        "Synthetic patient fixture was not found.",
      );
    }
    return patient;
  }

  private increment(key: SyntheticDiagnosticCounterKey): void {
    this.diagnostics.set(key, this.count(key) + 1);
  }

  private count(key: SyntheticDiagnosticCounterKey): number {
    return this.diagnostics.get(key) ?? 0;
  }
}
