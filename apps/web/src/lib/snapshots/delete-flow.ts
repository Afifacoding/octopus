import type { ApiEnvelope } from '../auth/types';

type SnapshotDeleteResult = {
  snapshot: {
    id: string;
  };
};

type ExecuteSnapshotDeleteOptions = {
  deleteRequest: () => Promise<ApiEnvelope<SnapshotDeleteResult>>;
  setDeleting: (isDeleting: boolean) => void;
  setError: (message: string | null) => void;
  onSuccess: (deletedSnapshotId: string) => void;
};

export async function executeSnapshotDelete(options: ExecuteSnapshotDeleteOptions) {
  options.setError(null);
  options.setDeleting(true);

  try {
    const result = await options.deleteRequest();

    if (!result.success) {
      options.setError(result.error.message);
      return false;
    }

    options.onSuccess(result.data.snapshot.id);
    return true;
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : 'Snapshot deletion failed. Please try again.';
    options.setError(message);
    return false;
  } finally {
    options.setDeleting(false);
  }
}
