import type {
  SecretCategory,
  SecretConfidence,
  SecretRecord,
} from '@octopus/shared';

export type { SecretCategory, SecretConfidence, SecretRecord };

export type SecretCreateRequest = {
  label: string;
  category: SecretCategory;
  confidence: SecretConfidence;
  value?: string;
  sourceSnapshotId?: string;
  sourceDetectionId?: string;
  sourceFilePath?: string;
  sourceLineNumber?: number;
  metadata?: Record<string, unknown>;
};

export type SecretUpdateRequest = {
  label?: string;
  category?: SecretCategory;
  confidence?: SecretConfidence;
  metadata?: Record<string, unknown>;
};

export type VaultSessionResponse = {
  unlocked: boolean;
  expiresAt: string | null;
};
