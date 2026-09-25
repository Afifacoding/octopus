export const SECRET_CATEGORIES = [
  'API_KEY',
  'ACCESS_TOKEN',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'DATABASE_URL',
  'JWT',
  'OAUTH_CLIENT_SECRET',
  'CLOUD_CREDENTIAL',
  'WEBHOOK_SECRET',
  'PASSWORD',
  'GENERIC_SECRET',
] as const;

export type SecretCategory = (typeof SECRET_CATEGORIES)[number];

export const SECRET_CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type SecretConfidence = (typeof SECRET_CONFIDENCE_LEVELS)[number];

export const SECRET_DETECTION_STATUSES = ['OPEN', 'IGNORED', 'IMPORTED'] as const;
export type SecretDetectionStatus = (typeof SECRET_DETECTION_STATUSES)[number];

export type SecretRecord = {
  id: string;
  projectId: string;
  sourceSnapshotId: string | null;
  sourceDetectionId: string | null;
  label: string;
  category: SecretCategory;
  confidence: SecretConfidence;
  maskedValue: string;
  sourceFilePath: string | null;
  sourceLineNumber: number | null;
  metadata: Record<string, unknown> | null;
  lastRevealedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SecretDetectionRecord = {
  id: string;
  snapshotId: string;
  category: SecretCategory;
  confidence: SecretConfidence;
  status: SecretDetectionStatus;
  detectionRule: string;
  sourceFilePath: string;
  sourceLineNumber: number | null;
  maskedPreview: string;
  fingerprint: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SecretCreateInput = {
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

export type SecretUpdateInput = {
  label?: string;
  category?: SecretCategory;
  confidence?: SecretConfidence;
  metadata?: Record<string, unknown>;
};

export type DetectionProcessResult = {
  snapshotId: string;
  detections: SecretDetectionRecord[];
};
