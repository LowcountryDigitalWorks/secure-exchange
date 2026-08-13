import { DomainError } from "./errors.js";
import type { DeploymentId, QueueId, ThreadId } from "./types.js";

export type ThreadLifecycleState =
  | "NEW"
  | "IN_PROGRESS"
  | "AWAITING_EXTERNAL"
  | "AWAITING_STAFF"
  | "COMPLETED"
  | "EXPIRED"
  | "DISPOSED";

export interface Thread {
  readonly threadId: ThreadId;
  readonly deploymentId: DeploymentId;
  readonly queueId: QueueId;
  readonly routingCategory: string;
  readonly state: ThreadLifecycleState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastActivityAt: string;
  readonly attentionAt?: string;
  readonly completedAt?: string;
  readonly dispositionDueAt?: string;
  readonly disposedAt?: string;
  readonly version: number;
}

export interface ThreadTransitionOptions {
  readonly at: string;
  readonly dispositionDueAt?: string;
}

export const ALLOWED_THREAD_TRANSITIONS: Readonly<
  Record<ThreadLifecycleState, readonly ThreadLifecycleState[]>
> = {
  NEW: ["IN_PROGRESS", "COMPLETED", "EXPIRED"],
  IN_PROGRESS: ["AWAITING_EXTERNAL", "COMPLETED", "EXPIRED"],
  AWAITING_EXTERNAL: ["AWAITING_STAFF", "COMPLETED", "EXPIRED"],
  AWAITING_STAFF: ["IN_PROGRESS", "COMPLETED", "EXPIRED"],
  COMPLETED: ["EXPIRED", "DISPOSED"],
  EXPIRED: ["DISPOSED"],
  DISPOSED: [],
};

export const STAFF_REPLY_ALLOWED_STATES: readonly ThreadLifecycleState[] = [
  "NEW",
  "IN_PROGRESS",
  "AWAITING_EXTERNAL",
  "AWAITING_STAFF",
];

export const EXTERNAL_REPLY_ALLOWED_STATES: readonly ThreadLifecycleState[] = [
  "NEW",
  "IN_PROGRESS",
  "AWAITING_EXTERNAL",
  "AWAITING_STAFF",
];

export function isThreadTransitionAllowed(
  from: ThreadLifecycleState,
  to: ThreadLifecycleState,
): boolean {
  return ALLOWED_THREAD_TRANSITIONS[from].includes(to);
}

export function isStaffReplyAllowed(state: ThreadLifecycleState): boolean {
  return STAFF_REPLY_ALLOWED_STATES.includes(state);
}

export function requireStaffReplyAllowed(thread: Thread): void {
  if (!isStaffReplyAllowed(thread.state)) {
    throw new DomainError(
      "REPLY_NOT_ALLOWED",
      `Staff reply is not allowed while thread is ${thread.state}.`,
    );
  }
}

export function isExternalReplyAllowed(state: ThreadLifecycleState): boolean {
  return EXTERNAL_REPLY_ALLOWED_STATES.includes(state);
}

export function requireExternalReplyAllowed(thread: Thread): void {
  if (!isExternalReplyAllowed(thread.state)) {
    throw new DomainError(
      "REPLY_NOT_ALLOWED",
      `External reply is not allowed while thread is ${thread.state}.`,
    );
  }
}

export function transitionThread(
  thread: Thread,
  targetState: ThreadLifecycleState,
  expectedVersion: number,
  options: ThreadTransitionOptions,
): Thread {
  requireExpectedVersion(thread, expectedVersion);

  if (!isThreadTransitionAllowed(thread.state, targetState)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Transition ${thread.state} -> ${targetState} is not allowed.`,
    );
  }

  return {
    ...thread,
    state: targetState,
    updatedAt: options.at,
    version: thread.version + 1,
    ...(targetState === "COMPLETED"
      ? {
          completedAt: options.at,
          ...(options.dispositionDueAt === undefined
            ? {}
            : { dispositionDueAt: options.dispositionDueAt }),
        }
      : {}),
    ...(targetState === "DISPOSED" ? { disposedAt: options.at } : {}),
  };
}

export function recordThreadActivity(
  thread: Thread,
  expectedVersion: number,
  at: string,
): Thread {
  requireExpectedVersion(thread, expectedVersion);

  return {
    ...thread,
    updatedAt: at,
    lastActivityAt: at,
    version: thread.version + 1,
  };
}

export function recordExternalThreadActivity(
  thread: Thread,
  expectedVersion: number,
  at: string,
): Thread {
  requireExpectedVersion(thread, expectedVersion);

  return {
    ...thread,
    updatedAt: at,
    lastActivityAt: at,
    attentionAt: at,
    version: thread.version + 1,
  };
}

function requireExpectedVersion(thread: Thread, expectedVersion: number): void {
  if (thread.version !== expectedVersion) {
    throw new DomainError(
      "STALE_VERSION",
      `Expected thread version ${expectedVersion}, found ${thread.version}.`,
    );
  }
}
