import type { ApiEnvelope } from '../auth/types';

type ProjectDeleteResult = {
  projectId: string;
  deleted: boolean;
};

type ExecuteProjectDeleteOptions = {
  deleteRequest: () => Promise<ApiEnvelope<ProjectDeleteResult>>;
  setDeleting: (next: boolean) => void;
  setError: (message: string | null) => void;
  onSuccess: (projectId: string) => void;
};

export async function executeProjectDelete(options: ExecuteProjectDeleteOptions) {
  options.setError(null);
  options.setDeleting(true);

  try {
    const result = await options.deleteRequest();

    if (!result.success) {
      options.setError(result.error.message);
      return false;
    }

    options.onSuccess(result.data.projectId);
    return true;
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : 'Project deletion failed. Please try again.';
    options.setError(message);
    return false;
  } finally {
    options.setDeleting(false);
  }
}
