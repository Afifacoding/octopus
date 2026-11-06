import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { OctoConversation } from '../../lib/octo/octo-client';
import { OctoConversationSidebar } from './OctoConversationSidebar';

const conversations: OctoConversation[] = [
  {
    id: 'general-1',
    title: 'General help',
    conversationType: 'GENERAL',
    projectId: null,
    project: null,
    createdAt: '2026-11-06T09:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
  },
  {
    id: 'project-1',
    title: 'API review',
    conversationType: 'PROJECT',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'API' },
    createdAt: '2026-11-06T09:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
  },
];

describe('OctoConversationSidebar', () => {
  it('renders new chat, conversation kinds, and the active conversation', () => {
    const html = renderToStaticMarkup(
      <OctoConversationSidebar
        conversations={conversations}
        activeConversationId="project-1"
        loading={false}
        error={null}
        onNewChat={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(html).toContain('New Chat');
    expect(html).toContain('General');
    expect(html).toContain('Project · API');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Rename API review');
    expect(html).toContain('Delete API review');
  });

  it('shows loading, empty and error states', () => {
    const render = (loading: boolean, error: string | null, items: OctoConversation[]) =>
      renderToStaticMarkup(
        <OctoConversationSidebar
          conversations={items}
          activeConversationId={null}
          loading={loading}
          error={error}
          onNewChat={vi.fn()}
          onOpen={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    expect(render(true, null, [])).toContain('Loading chats');
    expect(render(false, null, [])).toContain('Your recent chats will appear here.');
    expect(render(false, 'Could not load chats.', [])).toContain('role="alert"');
  });
});
