// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OctoConversation,
  OctoConversationDetails,
  OctoConversationMessageResult,
  OctoSummary,
} from '../lib/octo/octo-client';

const api = vi.hoisted(() => ({
  approveOctoPatch: vi.fn(),
  createOctoConversation: vi.fn(),
  deleteOctoConversation: vi.fn(),
  getOctoConversation: vi.fn(),
  getOctoGraph: vi.fn(),
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
    }));
    expect(container.textContent).toContain('You have one project.');
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
