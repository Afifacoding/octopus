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
  projectId?: string | undefined;
  snapshotId?: string | undefined;
  userId: string;
};

export type OctoResponse = {
  reply: string;
  intent: OctoIntentType;
  suggestions: string[];
  summary: OctoSummary;
};

export type OctoSummary = {
  greeting: string;
  projectCount: number;
  snapshotCount: number;
  suggestions: string[];
};

export type WorkspaceContext = {
  userId: string;
  projectCount: number;
  snapshotCount: number;
  projects: Array<{
    id: string;
    name: string;
    color: string;
    snapshotCount: number;
  }>;
  currentProjectId?: string;
  currentProjectName?: string;
  currentProjectSnapshotCount?: number;
  currentSnapshotId?: string;
};

export type OctoServiceError = {
  code: string;
  message: string;
  retryable: boolean;
};
