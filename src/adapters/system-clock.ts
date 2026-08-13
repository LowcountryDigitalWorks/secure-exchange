import type { Clock } from "../application/clock.js";

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
