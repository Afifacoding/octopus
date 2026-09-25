import { HttpError } from '../errors/http-error.js';

export function requireString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a non-empty string`);
  }

  return value;
}
