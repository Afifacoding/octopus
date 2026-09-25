export type SnapshotStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SnapshotCaptureSource = 'EXTENSION' | 'WEB' | 'API';

export type SnapshotArchivePayload = {
  fileName: string;
  contentType: string;
  base64Data: string;
  sizeBytes: number;
};

export type SnapshotCreateRequest = {
  captureSource: SnapshotCaptureSource;
  clientName?: string;
  clientVersion?: string;
  fileCount?: number;
  directoryCount?: number;
  metadata?: Record<string, unknown>;
  archive: SnapshotArchivePayload;
  entries?: Array<{
    path: string;
    type: 'FILE' | 'DIRECTORY';
  }>;
};

export type SnapshotRecord = {
  id: string;
  projectId: string;
  status: SnapshotStatus;
  captureSource: SnapshotCaptureSource;
  clientName: string | null;
  clientVersion: string | null;
  archiveStorageKey: string | null;
  archiveContentType: string | null;
  archiveSizeBytes: number | null;
  fileCount: number | null;
  directoryCount: number | null;
  integrityAlgorithm: string | null;
  integrityHash: string | null;
  failureCode: string | null;
  failureReason: string | null;
  captureMetadata: Record<string, unknown> | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
