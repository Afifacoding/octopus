import { describe, expect, it } from 'vitest';

import { getWorkspaceSessionKey, mapWorkspaceFolders } from './workspace-detection';

describe('workspace detection', () => {
  it('supports single-root workspace mapping', () => {
    const roots = mapWorkspaceFolders([
      {
        name: 'app',
        uri: { fsPath: 'C:/repo/app' },
      },
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.name).toBe('app');
  });

  it('supports multi-root workspace mapping', () => {
    const roots = mapWorkspaceFolders([
      { name: 'frontend', uri: { fsPath: 'C:/repo/frontend' } },
      { name: 'backend', uri: { fsPath: 'C:/repo/backend' } },
    ]);

    expect(roots).toHaveLength(2);
    expect(getWorkspaceSessionKey(roots)).toContain('frontend');
    expect(getWorkspaceSessionKey(roots)).toContain('backend');
  });

  it('handles missing workspace folders', () => {
    const roots = mapWorkspaceFolders(undefined);
    expect(roots).toEqual([]);
  });
});
