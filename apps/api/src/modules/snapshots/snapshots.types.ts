export type SnapshotStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SnapshotCaptureSource = 'EXTENSION' | 'WEB' | 'API';
export type BlueprintStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SnapshotTreeNode = {
  name: string;
  relativePath: string;
  type: 'DIRECTORY' | 'FILE';
  sizeBytes: number | null;
  children: SnapshotTreeNode[];
};

export type SnapshotDirectoryTree = {
  generatedAt: string;
  totalEntries: number;
  totalFiles: number;
  totalDirectories: number;
  totalSizeBytes: number;
  nodes: SnapshotTreeNode[];
};

export type PublicSnapshot = {
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

export type SnapshotArchiveEntryType = 'FILE' | 'DIRECTORY';

export type SnapshotArchiveEntry = {
  path: string;
  type: SnapshotArchiveEntryType;
};

export type SnapshotCreateInput = {
  captureSource: SnapshotCaptureSource;
  clientName?: string;
  clientVersion?: string;
  fileCount?: number;
  directoryCount?: number;
  metadata?: Record<string, unknown>;
  archive: {
    fileName: string;
    contentType: string;
    base64Data: string;
    sizeBytes: number;
  };
  entries?: SnapshotArchiveEntry[];
};

export type SnapshotDirectoryTreeResponse = {
  snapshotId: string;
  status: SnapshotStatus;
  failureCode: string | null;
  failureReason: string | null;
  directoryTree: SnapshotDirectoryTree | null;
};

export type SnapshotFileContentUnsupportedReason = 'BINARY_FILE' | 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE';

export type SnapshotFileContentData = {
  path: string;
  fileName: string;
  sizeBytes: number;
  contentTypeGuess: string | null;
  isText: boolean;
  supported: boolean;
  unsupportedReason: SnapshotFileContentUnsupportedReason | null;
  redactionApplied: boolean;
  truncated: boolean;
  content: string | null;
};

export type SnapshotFileContentResponse = {
  snapshotId: string;
  status: SnapshotStatus;
  failureCode: string | null;
  failureReason: string | null;
  file: SnapshotFileContentData;
};

export type BlueprintRecord = {
  id: string;
  snapshotId: string;
  status: BlueprintStatus;
  projectType: string | null;
  detectedFrameworks: string[];
  detectedLanguages: string[];
  importantConfigFiles: string[];
  dependencyMetadata: Record<string, unknown> | null;
  entryPoints: string[];
  detectedCommands: string[];
  environmentReferences: string[];
  summary: string | null;
  failureCode: string | null;
  failureReason: string | null;
  processedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotBlueprintResponse = {
  snapshotId: string;
  snapshotStatus: SnapshotStatus;
  blueprint: BlueprintRecord;
};
