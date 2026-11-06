/**
 * Octo - Native OCTOPUS Intelligence Assistant
 * Type definitions for the native Octo module
 */

export type OctoPageContext =
  | 'DASHBOARD'
  | 'PROJECTS'
  | 'PROJECT_DETAILS'
  | 'SNAPSHOT'
  | 'BLUEPRINT'
  | 'SECRET_VAULT'
  | 'SETTINGS';

export type OctoModelSelection = {
  provider: 'gemini' | 'openai' | 'openrouter';
  model: string;
};

export type OctoIntentType =
  // Projects
  | 'PROJECT_COUNT'
  | 'PROJECT_LIST'
  | 'PROJECT_DETAILS'
  | 'PROJECT_EDIT_GUIDANCE'
  | 'PROJECT_DELETE_GUIDANCE'
  // Snapshots
  | 'SNAPSHOT_COUNT'
  | 'SNAPSHOT_COUNT_IN_PROJECT'
  | 'LATEST_SNAPSHOT'
  | 'PROJECT_WITH_MOST_SNAPSHOTS'
  | 'SNAPSHOT_DELETE_BEHAVIOR'
  | 'RESTORE_GUIDANCE'
  // Blueprint
  | 'BLUEPRINT_EXPLANATION'
  | 'BLUEPRINT_ARCHITECTURE'
  | 'BLUEPRINT_METADATA'
  // Directory/Structure
  | 'PROJECT_STRUCTURE'
  | 'FRAMEWORK_DETECTION'
  // OCTOPUS Concepts
  | 'WHAT_IS_OCTOPUS'
  | 'WHAT_IS_INSTANT_REBIRTH'
  | 'WHAT_IS_SECRET_VAULT'
  | 'WHAT_IS_PROJECT_COLOR'
  | 'WHAT_IS_SNAPSHOT'
  | 'WHAT_IS_BLUEPRINT'
  // Navigation
  | 'NAVIGATE_TO_SNAPSHOTS'
  | 'NAVIGATE_TO_BLUEPRINT'
  | 'NAVIGATE_TO_SECRETS'
  | 'WHERE_CAN_I_EDIT_PROJECT'
  // Security/Blocked
  | 'BLOCK_PASSWORD_REQUEST'
  | 'BLOCK_API_KEY_REQUEST'
  | 'BLOCK_SECRET_REQUEST'
  | 'BLOCK_TOKEN_REQUEST'
  // Unknown
  | 'UNKNOWN';

export type OctoIntentMatch = {
  intent: OctoIntentType;
  confidence: number; // 0-1
  entityName?: string; // Project name if matched
  projectId?: string;
  snapshotId?: string;
};

export type OctoRequest = {
  question: string;
  pageContext: OctoPageContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'learn' | 'debug' | 'dsa' | 'code-review' | 'interview' | 'project-assistant';
  modelSelection?: OctoModelSelection;
  images?: string[];
  projectId?: string | undefined;
  snapshotId?: string | undefined;
  compare?: { baseSnapshotId: string; targetSnapshotId: string } | undefined;
  throwOnAiFailure?: boolean | undefined;
  userId: string;
};

export type OctoResponse = {
  reply: string;
  intent: OctoIntentType;
  suggestions: string[];
  summary: OctoSummary;
  intelligence?: OctoIntelligencePayload;
  patchProposal?: {
    patchId: string;
    filePath: string;
    summary: string;
    diff: string;
    additions: number;
    deletions: number;
  };
  modelSelection?: OctoModelSelection;
};

export type OctoSummary = {
  greeting: string;
  projectCount: number;
  snapshotCount: number;
  assistantMode: 'live' | 'offline';
  projects: Array<{
    id: string;
    name: string;
    color: string;
    snapshotCount: number;
    failedSnapshotCount: number;
    inProgressSnapshotCount: number;
    latestSnapshotAt: string | null;
    snapshots: Array<{ id: string; createdAt: string }>;
  }>;
  suggestions: string[];
};

export type WorkspaceProjectContext = {
  id: string;
  name: string;
  color: string;
  /** Completed snapshots only; failed and in-progress snapshots are counted separately. */
  snapshotCount: number;
  failedSnapshotCount?: number;
  inProgressSnapshotCount?: number;
  latestSnapshotAt?: string | null;
  /** Completed snapshots, newest first. */
  snapshots?: Array<{ id: string; createdAt: string }>;
};

export type WorkspaceContext = {
  userId: string;
  projectCount: number;
  snapshotCount: number;
  projects: WorkspaceProjectContext[];
  currentProjectId?: string;
  currentProjectName?: string;
  currentProjectSnapshotCount?: number;
  currentSnapshotId?: string;
};

export type OctoSnapshotSummary = {
  id: string;
  sequence: number | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  captureSource: 'EXTENSION' | 'WEB' | 'API';
  clientName: string | null;
  clientVersion: string | null;
  createdAt: string;
  processedAt: string | null;
  fileCount: number | null;
  directoryCount: number | null;
  archiveSizeBytes: number | null;
  failureCode: string | null;
};

export type OctoWorkspaceStats = {
  countingRules: string[];
  projectCount: number;
  completedSnapshotCount: number;
  failedSnapshotCount: number;
  inProgressSnapshotCount: number;
  projects: Array<{
    id: string;
    name: string;
    color: string;
    completedSnapshots: number;
    failedSnapshots: number;
    inProgressSnapshots: number;
    latestSnapshotAt: string | null;
  }>;
  mostSnapshots: { count: number; projects: Array<{ id: string; name: string }> } | null;
  latestSnapshot: { projectId: string; projectName: string; snapshotId: string; createdAt: string } | null;
};

export type OctoComparisonFile = {
  path: string;
  status: 'ADDED' | 'MODIFIED' | 'DELETED' | 'UNCHANGED';
  baseSizeBytes: number | null;
  targetSizeBytes: number | null;
  sizeDeltaBytes: number;
  sensitive: boolean;
};

export type OctoSnapshotComparison = {
  projectId: string;
  projectName: string;
  base: OctoComparisonSnapshotRef;
  target: OctoComparisonSnapshotRef;
  summary: {
    baseFileCount: number;
    targetFileCount: number;
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
    changed: number;
    baseTotalBytes: number;
    targetTotalBytes: number;
    netSizeDeltaBytes: number;
    sensitiveChanged: number;
  };
  added: OctoComparisonFile[];
  modified: OctoComparisonFile[];
  deleted: OctoComparisonFile[];
  unchanged: OctoComparisonFile[];
  truncated: { added: boolean; modified: boolean; deleted: boolean; unchanged: boolean };
  directories: Array<{ directory: string; added: number; modified: number; deleted: number; unchanged: number }>;
};

export type OctoComparisonSnapshotRef = {
  id: string;
  sequence: number | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  fileCount: number | null;
  directoryCount: number | null;
  archiveSizeBytes: number | null;
};

export type OctoIntelligencePayload =
  | { kind: 'WORKSPACE_STATS'; stats: OctoWorkspaceStats }
  | { kind: 'PROJECT_SNAPSHOTS'; project: { id: string; name: string }; snapshots: OctoSnapshotSummary[] }
  | { kind: 'SNAPSHOT_COMPARISON'; comparison: OctoSnapshotComparison };

export type OctoServiceError = {
  code: string;
  message: string;
  retryable: boolean;
};
