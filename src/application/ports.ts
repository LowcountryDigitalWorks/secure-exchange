import type {
  ActorAuthorization,
  ActorRef,
  AuditEvent,
  CompletionPolicy,
  DeploymentId,
  Thread,
  ThreadId,
  TransferAttestation,
  TransferAttestationControl,
} from "../domain/index.js";

export interface WorkflowMutation {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly expectedThreadVersion?: number;
  readonly nextThread?: Thread;
  readonly auditEvents?: readonly AuditEvent[];
  readonly transferAttestations?: readonly TransferAttestation[];
  readonly transferAttestationControls?: readonly TransferAttestationControl[];
}

export interface WorkflowStore {
  getThread(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<Thread | undefined>;

  getCurrentCompletionPolicy(
    deploymentId: DeploymentId,
  ): Promise<CompletionPolicy | undefined>;

  getActorAuthorization(
    deploymentId: DeploymentId,
    actorRef: ActorRef,
  ): Promise<ActorAuthorization | undefined>;

  listTransferAttestations(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestation[]>;

  listTransferAttestationControls(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestationControl[]>;

  commit(mutation: WorkflowMutation): Promise<void>;
}
