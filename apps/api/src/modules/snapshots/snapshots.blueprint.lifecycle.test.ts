import { describe, expect, it } from 'vitest';

import { HttpError } from '../../core/errors/http-error.js';
import { assertBlueprintTransition } from './snapshots.blueprint.lifecycle.js';

describe('blueprint lifecycle transitions', () => {
  it('allows valid transitions', () => {
    expect(() => assertBlueprintTransition('PENDING', 'PROCESSING')).not.toThrow();
    expect(() => assertBlueprintTransition('PROCESSING', 'COMPLETED')).not.toThrow();
    expect(() => assertBlueprintTransition('FAILED', 'PROCESSING')).not.toThrow();
    expect(() => assertBlueprintTransition('COMPLETED', 'PROCESSING')).not.toThrow();
  });

  it('blocks invalid transitions', () => {
    expect(() => assertBlueprintTransition('PENDING', 'COMPLETED')).toThrowError(HttpError);
    expect(() => assertBlueprintTransition('COMPLETED', 'FAILED')).toThrowError(HttpError);
  });
});
