// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OctoConversation,
  OctoConversationDetails,
  OctoConversationMessageResult,
  OctoProjectGraph,
  OctoProjectRecommendations,
  OctoSummary,
} from '../lib/octo/octo-client';

const api = vi.hoisted(() => ({
  approveOctoPatch: vi.fn(),
  createOctoConversation: vi.fn(),
  deleteOctoConversation: vi.fn(),
  getOctoConversation: vi.fn(),
  getOctoGraph: vi.fn(),
  getOctoModelCatalog: vi.fn(),
  getOctoRecommendations: vi.fn(),
  getOctoSummary: vi.fn(),
  listOctoConversations: vi.fn(),
  rejectOctoPatch: vi.fn(),
  renameOctoConversation: vi.fn(),
  sendOctoConversationMessage: vi.fn(),
}));

vi.mock('../lib/octo/octo-client', () => api);

import { OctoPage } from './OctoPage';

const projectSummary: OctoSummary = {
  greeting: 'Hello',
  projectCount: 1,
  snapshotCount: 1,
  assistantMode: 'live',
  projects: [{
    id: 'proj-1',
    name: 'API Project',
    color: 'TEAL',
    snapshotCount: 1,
    snapshots: [{ id: 'snap-1', createdAt: '2026-11-06T09:00:00.000Z' }],
  }],
  suggestions: [],
};

const projectConversation: OctoConversation = {
  id: 'conv-1',
  title: 'API discussion',
  conversationType: 'PROJECT',
  projectId: 'proj-1',
  project: { id: 'proj-1', name: 'API Project' },
  createdAt: '2026-11-06T09:00:00.000Z',
  updatedAt: '2026-11-06T09:00:00.000Z',
};

const savedDetails: OctoConversationDetails = {
  ...projectConversation,
  messages: [{
    id: 'msg-1',
    role: 'USER',
    content: 'Saved question',
    metadata: null,
    createdAt: '2026-11-06T09:01:00.000Z',
  }],
  hasMore: false,
  nextCursor: null,
};

let root: Root;
let container: HTMLDivElement;

function flush() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderPage() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OctoPage />);
  });
  await flush();
}

function buttonByText(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim().includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  api.getOctoSummary.mockResolvedValue(projectSummary);
  api.listOctoConversations.mockResolvedValue({
    conversations: [projectConversation],
    page: 1,
    pageSize: 50,
    total: 1,
    hasMore: false,
  });
  api.getOctoConversation.mockResolvedValue(savedDetails);
  api.getOctoGraph.mockResolvedValue(null);
  api.getOctoModelCatalog.mockResolvedValue({
    active: { provider: 'gemini', model: 'gemini-2.0-flash' },
    providers: [
      {
        id: 'gemini',
        name: 'Google Gemini',
        configured: true,
        models: [{
          id: 'gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          description: 'Low-latency general assistant model.',
          capabilities: ['Text', 'Images'],
          configured: true,
        }],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        configured: false,
        models: [{
          id: 'gpt-4o-mini',
          name: 'GPT-4o mini',
          description: 'Efficient general assistant model.',
          capabilities: ['Text', 'Images'],
          configured: false,
        }],
      },
    ],
  });
  api.getOctoRecommendations.mockResolvedValue(null);
  api.approveOctoPatch.mockResolvedValue(null);
  api.rejectOctoPatch.mockResolvedValue(true);
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  document.body.innerHTML = '';
});

describe('OCTOBOT conversation history UI', () => {
  it('loads saved history and restores its project context', async () => {
    await renderPage();

    expect(container.textContent).toContain('Saved question');
    expect(api.getOctoConversation).toHaveBeenCalledWith('conv-1');
    const projectSelect = container.querySelector('.octo-header-tools select') as HTMLSelectElement;
    expect(projectSelect.value).toBe('proj-1');
    expect(projectSelect.disabled).toBe(true);
    expect(container.textContent).toContain('Project · API Project');
  });

  it('shows evidence-based platform recommendations for the selected project snapshot', async () => {
    const result: OctoProjectRecommendations = {
      projectId: 'proj-1',
      snapshotId: 'snap-1',
      analysisStatus: 'COMPLETE',
      stack: {
        languages: [{ name: 'TypeScript', fileCount: 3 }],
        frameworks: ['React', 'Vite'],
        packageManagers: ['pnpm'],
        buildSystems: ['Vite'],
        databases: [],
        deploymentConfiguration: [],
        configurationPaths: [],
        manifestPaths: ['apps/web/package.json'],
      },
      recommendations: [{
        id: 'vite-static-web',
        category: 'WEB_HOSTING',
        title: 'Deploy the Vite web build as a separate static site',
        whyItFits: 'React and Vite are present in the project manifest.',
        benefits: ['Uses the detected web build tool'],
        limitations: ['Output configuration must be checked'],
        integrationComplexity: 'MEDIUM',
        alternatives: ['Any static file host after validation'],
        evidence: ['apps/web/package.json'],
        compatibilityNotes: ['No platform was tested.'],
      }],
      pricingAndAvailability: 'NOT_VERIFIED',
    };
    api.getOctoRecommendations.mockResolvedValue(result);
    await renderPage();

    await click(buttonByText('Platform recommendations'));
    await flush();

    expect(api.getOctoRecommendations).toHaveBeenCalledWith('proj-1', 'snap-1');
    expect(container.textContent).toContain(result.recommendations[0]?.title);
    expect(container.textContent).toContain('apps/web/package.json');
    expect(container.textContent).toContain('Pricing and availability not verified');
    expect(container.textContent).toContain('No platform was tested.');
  });

  it('shows an explicit error when platform recommendations are unavailable', async () => {
    await renderPage();

    await click(buttonByText('Platform recommendations'));
    await flush();

    expect(container.textContent).toContain('Recommendations could not be loaded for this snapshot.');
  });

  it('starts a new chat without deleting prior chats and persists a sent message', async () => {
    const newConversation: OctoConversation = {
      ...projectConversation,
      id: 'conv-2',
      title: 'Show my projects',
    };
    api.createOctoConversation.mockResolvedValue(newConversation);
    api.sendOctoConversationMessage.mockResolvedValue({
      conversation: newConversation,
      userMessage: {
        id: 'msg-2', role: 'USER', content: 'Show my projects', metadata: null, createdAt: '2026-11-06T10:00:00.000Z',
      },
      assistantMessage: {
        id: 'msg-3', role: 'ASSISTANT', content: 'You have one project.', metadata: null, createdAt: '2026-11-06T10:00:01.000Z',
      },
    } satisfies OctoConversationMessageResult);
    await renderPage();

    await click(buttonByText('New Chat'));
    expect(container.textContent).not.toContain('Saved question');
    expect(container.textContent).toContain('API discussion');

    await click(buttonByText('Show my projects'));
    expect(api.createOctoConversation).toHaveBeenCalledWith({ conversationType: 'PROJECT', projectId: 'proj-1' });
    expect(api.sendOctoConversationMessage).toHaveBeenCalledWith('conv-2', expect.objectContaining({
      content: 'Show my projects',
      snapshotId: 'snap-1',
      pageContext: 'DASHBOARD',
      modelSelection: { provider: 'gemini', model: 'gemini-2.0-flash' },
    }));
    expect(container.textContent).toContain('You have one project.');
  });

  it('shows configured models, disables unavailable providers and submits the selected model', async () => {
    const newConversation: OctoConversation = { ...projectConversation, id: 'conv-model' };
    api.createOctoConversation.mockResolvedValue(newConversation);
    api.sendOctoConversationMessage.mockResolvedValue({
      conversation: newConversation,
      userMessage: {
        id: 'model-user', role: 'USER', content: 'Explain this code', metadata: null, createdAt: '2026-11-06T10:00:00.000Z',
      },
      assistantMessage: {
        id: 'model-assistant',
        role: 'ASSISTANT',
        content: 'Use Promise.all for independent requests.\n\n```ts\nawait Promise.all(tasks);\n```',
        metadata: { modelSelection: { provider: 'gemini', model: 'gemini-2.0-flash' } },
        createdAt: '2026-11-06T10:00:01.000Z',
      },
    } satisfies OctoConversationMessageResult);
    await renderPage();

    const selector = container.querySelector('select[aria-label="AI model"]') as HTMLSelectElement;
    expect(selector.value).toBe('gemini:gemini-2.0-flash');
    expect(Array.from(selector.options).find((option) => option.value === 'openai:gpt-4o-mini')?.disabled).toBe(true);

    await click(buttonByText('New Chat'));
    await click(buttonByText('Show my projects'));
    expect(api.sendOctoConversationMessage).toHaveBeenCalledWith('conv-model', expect.objectContaining({
      modelSelection: { provider: 'gemini', model: 'gemini-2.0-flash' },
    }));
    expect(container.textContent).toContain('Google Gemini · Gemini 2.0 Flash');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await click(buttonByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('await Promise.all(tasks);');
    expect(container.textContent).toContain('Copied');
  });

  it('allows switching project context before a new general chat', async () => {
    api.createOctoConversation.mockResolvedValue({
      ...projectConversation,
      id: 'general-2',
      title: 'General question',
      conversationType: 'GENERAL',
      projectId: null,
      project: null,
    });
    api.sendOctoConversationMessage.mockResolvedValue({
      conversation: null,
      userMessage: {
        id: 'msg-2', role: 'USER', content: 'What is OCTOPUS?', metadata: null, createdAt: '2026-11-06T10:00:00.000Z',
      },
      assistantMessage: {
        id: 'msg-3', role: 'ASSISTANT', content: 'A project snapshot system.', metadata: null, createdAt: '2026-11-06T10:00:01.000Z',
      },
    });
    await renderPage();
    await click(buttonByText('New Chat'));

    const projectSelect = container.querySelector('.octo-header-tools select') as HTMLSelectElement;
    await act(async () => {
      projectSelect.value = '';
      projectSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(buttonByText('What is Blueprint?'));

    expect(api.createOctoConversation).toHaveBeenCalledWith({ conversationType: 'GENERAL' });
    expect(api.sendOctoConversationMessage).toHaveBeenCalledWith('general-2', expect.not.objectContaining({ projectId: 'proj-1' }));
  });

  it('renames and confirms deletion of a conversation', async () => {
    api.renameOctoConversation.mockResolvedValue({ ...projectConversation, title: 'Renamed' });
    api.deleteOctoConversation.mockResolvedValue(true);
    window.prompt = vi.fn().mockReturnValue('Renamed');
    window.confirm = vi.fn().mockReturnValue(true);
    await renderPage();

    await click(container.querySelector('[aria-label="Rename API discussion"]') as HTMLButtonElement);
    expect(api.renameOctoConversation).toHaveBeenCalledWith('conv-1', 'Renamed');
    expect(container.textContent).toContain('Renamed');

    await click(container.querySelector('[aria-label="Delete Renamed"]') as HTMLButtonElement);
    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteOctoConversation).toHaveBeenCalledWith('conv-1');
    expect(container.textContent).not.toContain('Renamed');
  });

  it('shows a conversation-list loading failure', async () => {
    api.listOctoConversations.mockResolvedValue(null);
    await renderPage();
    expect(container.textContent).toContain("Couldn't load recent chats.");
    expect(container.textContent).toContain('Hi, I\'m OCTOBOT');
  });

  it('displays Graphify parser coverage and AST relationships', async () => {
    const graph: OctoProjectGraph = {
      projectId: 'proj-1',
      snapshotId: 'snap-1',
      generatedAt: '2026-11-06T09:00:00.000Z',
      nodes: [
        {
          id: 'src/auth.ts',
          label: 'auth.ts',
          type: 'file',
          filePath: 'src/auth.ts',
          metrics: { inDegree: 0, outDegree: 1, centralityScore: 1, isGodNode: false },
        },
        {
          id: 'src/auth.ts::AuthService@1',
          label: 'AuthService',
          type: 'class',
          filePath: 'src/auth.ts',
          line: 1,
          metrics: { inDegree: 1, outDegree: 1, centralityScore: 3, isGodNode: true },
        },
      ],
      edges: [
        { source: 'src/auth.ts', target: 'src/auth.ts::AuthService@1', type: 'contains' },
      ],
      godNodes: [{
        id: 'src/auth.ts::AuthService@1',
        label: 'AuthService',
        filePath: 'src/auth.ts',
        metrics: { centralityScore: 3 },
      }],
      clusters: [{ name: 'Business Logic', description: 'Services', nodeIds: ['src/auth.ts::AuthService@1'] }],
      metrics: { totalNodes: 2, totalEdges: 1, density: 0.25, averageDegree: 0.5 },
      analysis: {
        status: 'COMPLETE',
        parser: 'typescript-compiler-api',
        supportedLanguages: ['TypeScript'],
        parsedFileCount: 1,
        unsupportedFileCount: 0,
        malformedFileCount: 0,
        sourceTruncated: false,
        graphTruncated: false,
      },
      report: { summary: '2 entities, 1 relationship.', riskAreas: [], recommendations: [] },
    };
    api.getOctoGraph.mockResolvedValue(graph);
    await renderPage();

    await click(buttonByText('Graphify'));

    expect(container.textContent).toContain('Complete TypeScript/JavaScript analysis.');
    expect(container.textContent).toContain('AuthService');
    expect(container.textContent).toContain('Direct relationships');
    expect(container.textContent).toContain('contains');
  });

  it('preserves the draft when a message request fails', async () => {
    api.sendOctoConversationMessage.mockResolvedValue(null);
    await renderPage();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Please explain this');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(buttonByText('Send'));

    expect(api.sendOctoConversationMessage).toHaveBeenCalled();
    expect(textarea.value).toBe('Please explain this');
    expect(container.textContent).toContain('OCTOBOT could not complete that message.');
  });
});
