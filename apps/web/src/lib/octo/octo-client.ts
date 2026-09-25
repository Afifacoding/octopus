/**
 * Octo Frontend API Client
 * Communicates with the native Octo backend
 */

import type { OctoPageContext } from '@octopus/shared';

export type OctoSummary = {
  greeting: string;
  projectCount: number;
  snapshotCount: number;
  suggestions: string[];
};

export type OctoResponse = {
  reply: string;
  intent: string;
  suggestions: string[];
  summary: OctoSummary;
};

export type OctoAskRequest = {
  question: string;
  pageContext: OctoPageContext;
  projectId?: string;
  snapshotId?: string;
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
