import { describe, expect, it, vi } from 'vitest';

import { executeProjectDelete } from './delete-flow';

describe('executeProjectDelete', () => {
  it('exits loading state on success', async () => {
    const loadingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      loadingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();
    const onSuccess = vi.fn<(projectId: string) => void>();

    const ok = await executeProjectDelete({
      deleteRequest: async () => ({
        success: true,
        data: {
          projectId: 'project_1',
          deleted: true,
        },
      }),
      setDeleting,
      setError,
      onSuccess,
    });

    expect(ok).toBe(true);
    expect(setError).toHaveBeenCalledWith(null);
    expect(onSuccess).toHaveBeenCalledWith('project_1');
    expect(loadingCalls).toEqual([true, false]);
  });

  it('exits loading state and surfaces backend rejection message', async () => {
    const loadingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      loadingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();

    const ok = await executeProjectDelete({
      deleteRequest: async () => ({
        success: false,
        error: {
          code: 'PROJECT_HAS_SNAPSHOTS',
          message: 'Delete all snapshots before deleting this project.',
        },
      }),
      setDeleting,
      setError,
      onSuccess: () => undefined,
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Delete all snapshots before deleting this project.');
    expect(loadingCalls).toEqual([true, false]);
  });

  it('exits loading state on thrown request error', async () => {
    const loadingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      loadingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();

    const ok = await executeProjectDelete({
      deleteRequest: async () => {
        throw new Error('Failed to fetch');
      },
      setDeleting,
      setError,
      onSuccess: () => undefined,
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Failed to fetch');
    expect(loadingCalls).toEqual([true, false]);
  });
});
