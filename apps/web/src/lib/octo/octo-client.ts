/**
 * Octo Frontend API Client
 * Communicates with the native Octo backend
 */

import type { OctoPageContext } from '@octopus/shared';

export type OctoProviderName = 'gemini' | 'openai' | 'openrouter';
export type OctoModelSelection = { provider: OctoProviderName; model: string };
export type OctoModelCatalog = {
  active: OctoModelSelection | null;
  providers: Array<{
    id: OctoProviderName;
    name: string;
    configured: boolean;
    models: Array<{
      id: string;
      name: string;
      description: string;
      capabilities: string[];
      configured: boolean;
    }>;
  }>;
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
  modelSelection?: OctoModelSelection;
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

export type OctoConversation = {
  id: string;
  title: string;
  conversationType: 'GENERAL' | 'PROJECT';
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string } | null;
};

export type OctoConversationMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  metadata?: (Record<string, unknown> & { modelSelection?: OctoModelSelection }) | null;
  createdAt: string;
};

export type OctoConversationPage = {
  conversations: OctoConversation[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type OctoConversationDetails = OctoConversation & {
  messages: OctoConversationMessage[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type OctoConversationMessageResult = {
  userMessage: OctoConversationMessage;
  assistantMessage: OctoConversationMessage;
  patchProposal?: OctoPatchProposal;
  conversation: OctoConversation | null;
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
    type: 'file' | 'directory' | 'class' | 'interface' | 'type' | 'function' | 'component' | 'endpoint';
    filePath: string;
    line?: number;
    metrics: { inDegree: number; outDegree: number; centralityScore: number; isGodNode: boolean };
  }>;
  edges: Array<{ source: string; target: string; type: string }>;
  godNodes: Array<{ id: string; label: string; filePath: string; metrics: { centralityScore: number } }>;
  clusters: Array<{ name: string; description: string; nodeIds: string[] }>;
  metrics: { totalNodes: number; totalEdges: number; density: number; averageDegree: number };
  analysis: {
    status: 'COMPLETE' | 'PARTIAL';
    parser: 'typescript-compiler-api';
    supportedLanguages: string[];
    parsedFileCount: number;
    unsupportedFileCount: number;
    malformedFileCount: number;
    sourceTruncated: boolean;
    graphTruncated: boolean;
  };
  report: {
    summary: string;
    riskAreas: Array<{ file: string; severity: 'high' | 'medium'; description: string }>;
    recommendations: string[];
  };
};

export type OctoProjectRecommendations = {
  projectId: string;
  snapshotId: string;
  analysisStatus: 'COMPLETE' | 'PARTIAL';
  stack: {
    languages: Array<{ name: string; fileCount: number }>;
    frameworks: string[];
    packageManagers: string[];
    buildSystems: string[];
    databases: string[];
    deploymentConfiguration: string[];
    configurationPaths: string[];
    manifestPaths: string[];
  };
  recommendations: Array<{
    id: string;
    category: 'WEB_HOSTING' | 'API_HOSTING' | 'DATABASE' | 'TESTING';
    title: string;
    whyItFits: string;
    benefits: string[];
    limitations: string[];
    integrationComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
    alternatives: string[];
    evidence: string[];
    compatibilityNotes: string[];
  }>;
  pricingAndAvailability: 'NOT_VERIFIED';
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
const OCTO_CONVERSATIONS_URL = `${API_BASE_URL}/octo/conversations`;

async function readApiData<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  const result = (await response.json()) as { success: boolean; data: T };
  return result.success ? result.data : null;
}

export async function createOctoConversation(input: {
  conversationType: 'GENERAL' | 'PROJECT';
  projectId?: string;
  title?: string;
}): Promise<OctoConversation | null> {
  try {
    const response = await fetch(OCTO_CONVERSATIONS_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return await readApiData<OctoConversation>(response);
  } catch (error) {
    console.error('Error creating OCTOBOT conversation:', error);
    return null;
  }
}

export async function listOctoConversations(input: {
  page?: number;
  pageSize?: number;
  conversationType?: 'GENERAL' | 'PROJECT';
} = {}): Promise<OctoConversationPage | null> {
  try {
    const url = new URL(OCTO_CONVERSATIONS_URL);
    if (input.page !== undefined) url.searchParams.set('page', String(input.page));
    if (input.pageSize !== undefined) url.searchParams.set('pageSize', String(input.pageSize));
    if (input.conversationType) url.searchParams.set('conversationType', input.conversationType);
    const response = await fetch(url.toString(), { credentials: 'include' });
    return await readApiData<OctoConversationPage>(response);
  } catch (error) {
    console.error('Error loading OCTOBOT conversations:', error);
    return null;
  }
}

export async function getOctoConversation(
  conversationId: string,
  messageLimit = 100,
  beforeMessageId?: string,
): Promise<OctoConversationDetails | null> {
  try {
    const url = new URL(`${OCTO_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}`);
    url.searchParams.set('messageLimit', String(messageLimit));
    if (beforeMessageId) url.searchParams.set('beforeMessageId', beforeMessageId);
    const response = await fetch(url.toString(), { credentials: 'include' });
    return await readApiData<OctoConversationDetails>(response);
  } catch (error) {
    console.error('Error loading OCTOBOT conversation:', error);
    return null;
  }
}

export async function renameOctoConversation(conversationId: string, title: string): Promise<OctoConversation | null> {
  try {
    const response = await fetch(`${OCTO_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return await readApiData<OctoConversation>(response);
  } catch (error) {
    console.error('Error renaming OCTOBOT conversation:', error);
    return null;
  }
}

export async function deleteOctoConversation(conversationId: string): Promise<boolean> {
  try {
    const response = await fetch(`${OCTO_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting OCTOBOT conversation:', error);
    return false;
  }
}

export async function sendOctoConversationMessage(
  conversationId: string,
  input: {
    content: string;
    pageContext: OctoPageContext;
    mode?: OctoAskRequest['mode'];
    modelSelection?: OctoModelSelection;
    snapshotId?: string;
    compare?: OctoAskRequest['compare'];
    images?: string[];
  },
): Promise<OctoConversationMessageResult | null> {
  try {
    const response = await fetch(`${OCTO_CONVERSATIONS_URL}/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return await readApiData<OctoConversationMessageResult>(response);
  } catch (error) {
    console.error('Error sending OCTOBOT conversation message:', error);
    return null;
  }
}

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

export async function getOctoModelCatalog(): Promise<OctoModelCatalog | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/octo/models`, { credentials: 'include' });
    return await readApiData<OctoModelCatalog>(response);
  } catch (error) {
    console.error('Error fetching OCTOBOT model configuration:', error);
    return null;
  }
}

export async function getOctoRecommendations(
  projectId: string,
  snapshotId: string,
): Promise<OctoProjectRecommendations | null> {
  try {
    const url = new URL(`${API_BASE_URL}/octo/recommendations`);
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('snapshotId', snapshotId);
    const response = await fetch(url.toString(), { credentials: 'include' });
    return await readApiData<OctoProjectRecommendations>(response);
  } catch (error) {
    console.error('Error fetching OCTOBOT platform recommendations:', error);
    return null;
  }
}
