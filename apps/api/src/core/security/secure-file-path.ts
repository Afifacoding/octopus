import path from 'node:path';

import { HttpError } from '../errors/http-error.js';

export function assertSafeRelativePath(inputPath: string) {
  const normalized = path.posix.normalize(inputPath.replace(/\\/g, '/'));

  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    throw new HttpError(400, 'UNSAFE_PATH', 'Path traversal attempt detected');
  }

  return normalized;
}
