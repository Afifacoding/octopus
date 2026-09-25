import { describe, expect, it, vi } from 'vitest';

import { executeSnapshotDelete } from './delete-flow';

describe('executeSnapshotDelete', () => {
  it('exits deleting state after success and invokes success callback', async () => {
    const deletingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      deletingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();
    const onSuccess = vi.fn<(snapshotId: string) => void>();

    const ok = await executeSnapshotDelete({
      deleteRequest: async () => ({
        success: true,
        data: {
          snapshot: {
            id: 'snapshot_1',
          },
        },
      }),
      setDeleting,
      setError,
      onSuccess,
    });

    expect(ok).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith('snapshot_1');
    expect(setError).toHaveBeenCalledWith(null);
    expect(deletingCalls).toEqual([true, false]);
  });

  it('exits deleting state and sets API error when delete fails', async () => {
    const deletingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      deletingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();
    const onSuccess = vi.fn<(snapshotId: string) => void>();

    const ok = await executeSnapshotDelete({
      deleteRequest: async () => ({
        success: false,
        error: {
          code: 'SNAPSHOT_DELETE_FAILED',
          message: 'Cannot delete snapshot',
        },
      }),
      setDeleting,
      setError,
      onSuccess,
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('Cannot delete snapshot');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(deletingCalls).toEqual([true, false]);
  });

  it('exits deleting state and sets fallback message when request throws', async () => {
    const deletingCalls: boolean[] = [];
    const setDeleting = (next: boolean) => {
      deletingCalls.push(next);
    };

    const setError = vi.fn<(message: string | null) => void>();
    const onSuccess = vi.fn<(snapshotId: string) => void>();

    const ok = await executeSnapshotDelete({
      deleteRequest: async () => {
        throw new Error('network down');
      },
      setDeleting,
      setError,
      onSuccess,
    });

    expect(ok).toBe(false);
    expect(setError).toHaveBeenCalledWith('network down');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(deletingCalls).toEqual([true, false]);
  });
});
