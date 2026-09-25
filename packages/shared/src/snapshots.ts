export const SNAPSHOT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

export const SNAPSHOT_CAPTURE_SOURCES = ['EXTENSION', 'WEB', 'API'] as const;
export type SnapshotCaptureSource = (typeof SNAPSHOT_CAPTURE_SOURCES)[number];

export const BLUEPRINT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];

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

export type SnapshotBlueprintProjectIdentity = {
  projectName: string | null;
  projectType: string | null;
  primaryLanguage: string | null;
  framework: string | null;
  runtime: string | null;
  packageManager: string | null;
  applicationType: string | null;
};

export type SnapshotBlueprintTechnologyStack = {
  frontend: string[];
  backend: string[];
  database: string[];
  tooling: string[];
};

export type SnapshotBlueprintEnvironmentVariable = {
  name: string;
  status: 'Required' | 'Optional';
  sourceFiles: string[];
};

export type SnapshotBlueprintConfigFile = {
  path: string;
  purpose: string;
};

export type SnapshotBlueprintArchitecture = {
  summary: string;
  flow: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type SnapshotBlueprintDatabase = {
  detected: boolean;
  technology: string | null;
  orm: string | null;
  schemaFile: string | null;
  migrationDirectory: string | null;
};

export type SnapshotBlueprintDeployment = {
  containerizationDetected: boolean;
  deploymentFiles: string[];
};

export type SnapshotBlueprintCompleteness = {
  projectStructure: boolean;
  technologyStack: boolean;
  dependencies: boolean;
  entryPoints: boolean;
  environmentVariables: boolean;
  runInstructions: boolean;
  databaseConfiguration: boolean;
  deploymentConfiguration: boolean;
};

export type SnapshotBlueprintMetadata = {
  projectIdentity?: SnapshotBlueprintProjectIdentity;
  technologyStack?: SnapshotBlueprintTechnologyStack;
  evidence?: Record<string, string[]>;
  structure?: {
    topLevelDirectories: string[];
    importantFolders?: string[];
    totalFiles: number;
  };
  architecture?: SnapshotBlueprintArchitecture;
  environment?: {
    variables: SnapshotBlueprintEnvironmentVariable[];
    references: string[];
  };
  configurationFiles?: SnapshotBlueprintConfigFile[];
  database?: SnapshotBlueprintDatabase;
  deployment?: SnapshotBlueprintDeployment;
  completeness?: SnapshotBlueprintCompleteness;
  processedStaticOnly?: boolean;
};

export type SnapshotBlueprint = {
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
  metadata: SnapshotBlueprintMetadata | null;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotBlueprintResponse = {
  snapshotId: string;
  snapshotStatus: SnapshotStatus;
  blueprint: SnapshotBlueprint;
};
