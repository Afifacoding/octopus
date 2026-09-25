import { apiRequest } from '../api/client';
import type { ApiEnvelope } from '../auth/types';
import type {
  SecretCreateRequest,
  SecretRecord,
  SecretUpdateRequest,
  VaultSessionResponse,
} from './types';

export async function getVaultSession(projectId: string) {
  return apiRequest<VaultSessionResponse>(`/projects/${projectId}/secrets/vault/session`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<VaultSessionResponse>>;
}

export async function unlockVault(projectId: string, password: string) {
  return apiRequest<VaultSessionResponse>(`/projects/${projectId}/secrets/vault/unlock`, {
    method: 'POST',
    body: {
      password,
    },
  }) as Promise<ApiEnvelope<VaultSessionResponse>>;
}

export async function lockVault(projectId: string) {
  return apiRequest<{ locked: boolean }>(`/projects/${projectId}/secrets/vault/lock`, {
    method: 'POST',
  }) as Promise<ApiEnvelope<{ locked: boolean }>>;
}

export async function listSecrets(projectId: string) {
  return apiRequest<{ secrets: SecretRecord[] }>(`/projects/${projectId}/secrets`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ secrets: SecretRecord[] }>>;
}

export async function createSecret(projectId: string, input: SecretCreateRequest) {
  return apiRequest<{ secret: SecretRecord }>(`/projects/${projectId}/secrets`, {
    method: 'POST',
    body: input,
  }) as Promise<ApiEnvelope<{ secret: SecretRecord }>>;
}

export async function getSecret(projectId: string, secretId: string) {
  return apiRequest<{ secret: SecretRecord }>(`/projects/${projectId}/secrets/${secretId}`, {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ secret: SecretRecord }>>;
}

export async function updateSecret(projectId: string, secretId: string, input: SecretUpdateRequest) {
  return apiRequest<{ secret: SecretRecord }>(`/projects/${projectId}/secrets/${secretId}`, {
    method: 'PATCH',
    body: input,
  }) as Promise<ApiEnvelope<{ secret: SecretRecord }>>;
}

export async function deleteSecret(projectId: string, secretId: string) {
  type DeleteSecretResult = { secretId: string; deleted: boolean; deletedDetectionId?: string };

  return apiRequest<DeleteSecretResult>(`/projects/${projectId}/secrets/${secretId}`, {
    method: 'DELETE',
  }) as Promise<ApiEnvelope<DeleteSecretResult>>;
}

export async function revealSecret(projectId: string, secretId: string) {
  return apiRequest<{ secretId: string; value: string; revealedAt: string }>(
    `/projects/${projectId}/secrets/${secretId}/reveal`,
    {
      method: 'POST',
    },
  ) as Promise<ApiEnvelope<{ secretId: string; value: string; revealedAt: string }>>;
}

export async function auditSecretCopy(projectId: string, secretId: string) {
  return apiRequest<{ secretId: string; copied: boolean }>(`/projects/${projectId}/secrets/${secretId}/copy`, {
    method: 'POST',
  }) as Promise<ApiEnvelope<{ secretId: string; copied: boolean }>>;
}

export async function auditSecretHide(projectId: string, secretId: string) {
  return apiRequest<{ secretId: string; hidden: boolean }>(`/projects/${projectId}/secrets/${secretId}/hide`, {
    method: 'POST',
  }) as Promise<ApiEnvelope<{ secretId: string; hidden: boolean }>>;
}
