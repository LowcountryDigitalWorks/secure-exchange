import type {
  ActorAuthorization,
  ActorRef,
  AuditEvent,
  CompletionPolicy,
  DeploymentId,
  Message,
  Queue,
  QueueId,
  Thread,
  ThreadId,
  TransferAttestation,
  TransferAttestationControl,
} from "../domain/index.js";

export interface WorkflowMutation {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly expectedThreadVersion?: number;
  readonly newThread?: Thread;
  readonly nextThread?: Thread;
  readonly messages?: readonly Message[];
  readonly auditEvents?: readonly AuditEvent[];
  readonly transferAttestations?: readonly TransferAttestation[];
  readonly transferAttestationControls?: readonly TransferAttestationControl[];
}

export interface WorkflowStore {
  getQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<Queue | undefined>;

  getThread(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<Thread | undefined>;

  listThreadsForQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<readonly Thread[]>;

  listMessages(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly Message[]>;

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
