import type { OctoConversation } from '../../lib/octo/octo-client';

type Props = {
  conversations: OctoConversation[];
  activeConversationId: string | null;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onNewChat: () => void;
  onOpen: (conversationId: string) => void;
  onRename: (conversation: OctoConversation) => void;
  onDelete: (conversation: OctoConversation) => void;
};

export function OctoConversationSidebar({
  conversations,
  activeConversationId,
  loading,
  error,
  disabled = false,
  onNewChat,
  onOpen,
  onRename,
  onDelete,
}: Props) {
  return (
    <aside className="octo-conversation-sidebar" aria-label="Conversation history">
      <div className="octo-conversation-sidebar-heading">
        <div>
          <h2>Chats</h2>
          <span>Recent conversations</span>
        </div>
        <button type="button" className="octo-new-chat-button" onClick={onNewChat} disabled={disabled}>
          <span aria-hidden="true">＋</span> New Chat
        </button>
      </div>
      {error && <p className="octo-conversation-sidebar-error" role="alert">{error}</p>}
      {loading && <p className="octo-conversation-sidebar-state">Loading chats…</p>}
      {!loading && conversations.length === 0 && !error && (
        <p className="octo-conversation-sidebar-state">Your recent chats will appear here.</p>
      )}
      <div className="octo-conversation-list">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`octo-conversation-item ${activeConversationId === conversation.id ? 'is-active' : ''}`}
          >
            <button
              type="button"
              className="octo-conversation-open"
              onClick={() => onOpen(conversation.id)}
              aria-current={activeConversationId === conversation.id ? 'page' : undefined}
              disabled={disabled}
            >
              <span className="octo-conversation-title">{conversation.title}</span>
              <span className="octo-conversation-kind">
                {conversation.conversationType === 'PROJECT'
                  ? `Project · ${conversation.project?.name ?? 'Project'}`
                  : 'General'}
              </span>
            </button>
            <div className="octo-conversation-actions">
              <button
                type="button"
                aria-label={`Rename ${conversation.title}`}
                title="Rename conversation"
                onClick={() => onRename(conversation)}
                disabled={disabled}
              >
                Rename
              </button>
              <button
                type="button"
                aria-label={`Delete ${conversation.title}`}
                title="Delete conversation"
                onClick={() => onDelete(conversation)}
                disabled={disabled}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
