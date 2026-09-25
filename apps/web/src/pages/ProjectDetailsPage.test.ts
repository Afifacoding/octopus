import { describe, expect, it } from 'vitest';

import { getProjectDeleteGuard } from './ProjectDetailsPage';

describe('ProjectDetailsPage delete guard', () => {
  it('blocks project deletion while snapshots remain', () => {
    const guard = getProjectDeleteGuard(3);
    expect(guard.canDelete).toBe(false);
    expect(guard.message).toBe('Delete all 3 snapshots before deleting this project.');
  });

  it('allows project deletion when snapshot count reaches zero', () => {
    const before = getProjectDeleteGuard(1);
    const after = getProjectDeleteGuard(0);

    expect(before.canDelete).toBe(false);
    expect(after.canDelete).toBe(true);
    expect(after.message).toBeNull();
  });
});
