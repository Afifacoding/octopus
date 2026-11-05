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
    snapshotCount: number;
    snapshots: Array<{ id: string; createdAt: string }>;
  }>;
  suggestions: string[];
};

export type OctoResponse = {
  reply: string;
  intent: string;
  suggestions: string[];
  summary: OctoSummary;
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
