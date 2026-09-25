import { HttpError } from '../../core/errors/http-error.js';
import type { BlueprintStatus } from './snapshots.types.js';

const allowedTransitions: Record<BlueprintStatus, BlueprintStatus[]> = {
  PENDING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['PROCESSING'],
  FAILED: ['PROCESSING'],
};

export function assertBlueprintTransition(from: BlueprintStatus, to: BlueprintStatus) {
  if (!allowedTransitions[from].includes(to)) {
    throw new HttpError(409, 'BLUEPRINT_INVALID_STATUS_TRANSITION', `Invalid blueprint status transition ${from} -> ${to}`);
  }
}
