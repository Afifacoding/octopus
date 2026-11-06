/**
 * Octo Frontend API Client
 * Communicates with the native Octo backend
 */

import type { OctoPageContext } from '@octopus/shared';

export type OctoSummary = {
  greeting: string;
  projectCount: number;
  snapshotCount: number;
  assistantMode: 'live' | 'offline';
  projects: Array<{
    id: string;
    name: string;
    color: string;
    /** Completed snapshots only. */
    snapshotCount: number;
    failedSnapshotCount?: number;
    inProgressSnapshotCount?: number;
    latestSnapshotAt?: string | null;
    /** Completed snapshots, newest first. */
    snapshots: Array<{ id: string; createdAt: string }>;
  }>;
  suggestions: string[];
};

export type OctoSnapshotStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type OctoSnapshotSummary = {
  id: string;
  sequence: number | null;
  status: OctoSnapshotStatus;
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

export type OctoComparisonSnapshotRef = {
  id: string;
  sequence: number | null;
  status: OctoSnapshotStatus;
  createdAt: string;
  fileCount: number | null;
  directoryCount: number | null;
  archiveSizeBytes: number | null;
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

export type OctoIntelligencePayload =
  | { kind: 'WORKSPACE_STATS'; stats: OctoWorkspaceStats }
  | { kind: 'PROJECT_SNAPSHOTS'; project: { id: string; name: string }; snapshots: OctoSnapshotSummary[] }
  | { kind: 'SNAPSHOT_COMPARISON'; comparison: OctoSnapshotComparison };

export type OctoResponse = {
  reply: string;
  intent: string;
  suggestions: string[];
  summary: OctoSummary;
  intelligence?: OctoIntelligencePayload;
  patchProposal?: OctoPatchProposal;
};

export type OctoAskRequest = {
  question: string;
  pageContext: OctoPageContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'learn' | 'debug' | 'dsa' | 'code-review' | 'interview' | 'project-assistant';
  images?: string[];
  projectId?: string;
  snapshotId?: string;
  /** Deterministic snapshot comparison; requires projectId. */
  compare?: { baseSnapshotId: string; targetSnapshotId: string };
};

export type OctoPatchProposal = {
  patchId: string;
  filePath: string;
  summary: string;
  diff: string;
  additions: number;
  deletions: number;
};

export type OctoProjectGraph = {
  projectId: string;
  snapshotId: string;
  generatedAt: string;
  nodes: Array<{
    id: string;
    label: string;
    type: 'file' | 'class' | 'interface' | 'function' | 'endpoint';
    filePath: string;
    line?: number;
    metrics: { inDegree: number; outDegree: number; centralityScore: number; isGodNode: boolean };
  }>;
  edges: Array<{ source: string; target: string; type: string }>;
  godNodes: Array<{ id: string; label: string; filePath: string; metrics: { centralityScore: number } }>;
  clusters: Array<{ name: string; description: string; nodeIds: string[] }>;
  metrics: { totalNodes: number; totalEdges: number; density: number; averageDegree: number };
  report: {
    summary: string;
    riskAreas: Array<{ file: string; severity: 'high' | 'medium'; description: string }>;
    recommendations: string[];
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export async function getOctoSummary(projectId?: string): Promise<OctoSummary | null> {
  try {
    const url = new URL(`${API_BASE_URL}/octo/summary`);
    if (projectId) {
      url.searchParams.set('projectId', projectId);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to get Octo summary:', response.statusText);
      return null;
    }

    const data = (await response.json()) as { success: boolean; data: OctoSummary };
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching Octo summary:', error);
    return null;
  }
}

export async function askOcto(request: OctoAskRequest): Promise<OctoResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/octo/ask`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.error('Failed to ask Octo:', response.statusText);
      return null;
    }

    const data = (await response.json()) as { success: boolean; data: OctoResponse };
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error asking Octo:', error);
    return null;
  }
}

export async function approveOctoPatch(patchId: string): Promise<{ id: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/octo/patches/${encodeURIComponent(patchId)}/approve`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { success: boolean; data: { snapshot: { id: string } } };
    return data.success ? data.data.snapshot : null;
  } catch (error) {
    console.error('Error approving OCTOBOT patch:', error);
    return null;
  }
}

export async function rejectOctoPatch(patchId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/octo/patches/${encodeURIComponent(patchId)}/reject`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch (error) {
    console.error('Error rejecting OCTOBOT patch:', error);
    return false;
  }
}

export async function getOctoGraph(projectId: string, snapshotId: string): Promise<OctoProjectGraph | null> {
  try {
    const url = new URL(`${API_BASE_URL}/octo/graph`);
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('snapshotId', snapshotId);
    const response = await fetch(url.toString(), { credentials: 'include' });
    if (!response.ok) return null;
    const data = (await response.json()) as { success: boolean; data: OctoProjectGraph };
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching OCTOBOT Graphify data:', error);
    return null;
  }
}
