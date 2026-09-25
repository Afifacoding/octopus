import { describe, expect, it } from 'vitest';

import { ASSISTANT_PAGE_CONTEXTS, ENV_MODES, PROJECT_COLORS, SNAPSHOT_STATUSES } from './index.js';

describe('shared foundation', () => {
  it('exposes environment modes', () => {
    expect(ENV_MODES).toContain('development');
  });

  it('exposes snapshot statuses', () => {
    expect(SNAPSHOT_STATUSES).toContain('COMPLETED');
  });

  it('exposes controlled project colors', () => {
    expect(PROJECT_COLORS).toContain('TEAL');
    expect(PROJECT_COLORS).toContain('PURPLE');
  });

  it('exposes assistant page contexts', () => {
    expect(ASSISTANT_PAGE_CONTEXTS).toContain('DASHBOARD');
  });
});
