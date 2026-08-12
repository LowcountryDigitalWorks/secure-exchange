import { DomainError } from "./errors.js";
import type { DeploymentId, QueueId } from "./types.js";

export const MAX_QUEUE_DISPLAY_LABEL_LENGTH = 80;
export const MAX_ROUTING_CATEGORY_LENGTH = 64;

const DISALLOWED_CONFIGURATION_CONTROL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export interface Queue {
  readonly queueId: QueueId;
  readonly deploymentId: DeploymentId;
  readonly active: boolean;
  readonly displayLabel: string;
  readonly allowedRoutingCategories: readonly string[];
}

export function validateRoutingCategory(value: string): string {
  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_ROUTING_CATEGORY_LENGTH ||
    DISALLOWED_CONFIGURATION_CONTROL.test(normalized)
  ) {
    throw new DomainError(
      "INVALID_ROUTING_CATEGORY",
      "Routing category must be bounded non-empty configuration text.",
    );
  }

  return normalized;
}

export function validateQueue(queue: Queue): Queue {
  const label = queue.displayLabel.trim();

  if (
    label.length === 0 ||
    label.length > MAX_QUEUE_DISPLAY_LABEL_LENGTH ||
    DISALLOWED_CONFIGURATION_CONTROL.test(label) ||
    queue.allowedRoutingCategories.length === 0
  ) {
    throw new DomainError(
      "INVALID_QUEUE_CONFIGURATION",
      "Queue configuration must have a bounded label and at least one routing category.",
    );
  }

  const categories = queue.allowedRoutingCategories.map(
    validateRoutingCategory,
  );
  if (new Set(categories).size !== categories.length) {
    throw new DomainError(
      "INVALID_QUEUE_CONFIGURATION",
      "Queue routing categories must be unique.",
    );
  }

  return {
    ...queue,
    displayLabel: label,
    allowedRoutingCategories: categories,
  };
}

export function queueAllowsRoutingCategory(
  queue: Queue,
  routingCategory: string,
): boolean {
  return queue.allowedRoutingCategories.includes(routingCategory);
}
