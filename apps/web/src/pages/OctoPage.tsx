import { useCallback, useEffect, useRef, useState } from 'react';
import { askOcto, getOctoSummary } from '../lib/octo/octo-client';
import type { OctoResponse, OctoSummary } from '../lib/octo/octo-client';
import type { OctoPageContext } from '@octopus/shared';

type Message = {
  role: 'user' | 'octo';
  content: string;
  timestamp: Date;
};

const QUICK_SUGGESTIONS = [
  'Show my projects',
  'How many snapshots do I have?',
  'What is Blueprint?',
  'How do I restore a snapshot?',
  'Where can I find my secrets?',
];

export function OctoPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OctoSummary | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pageContext: OctoPageContext = 'DASHBOARD';

  // Load initial summary
  useEffect(() => {
    const loadSummary = async () => {
      const result = await getOctoSummary();
      setSummary(result);
    };

    void loadSummary();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!question.trim()) return;

      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: question,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        const response = await askOcto({
          question,
          pageContext,
        });

        if (!response) {
          setError("I couldn't process that request. Please try again.");
          return;
        }

        // Add Octo response
        const octoMessage: Message = {
          role: 'octo',
          content: response.reply,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, octoMessage]);

        // Update summary with new suggestions
        if (response.summary) {
          setSummary(response.summary);
        }
      } catch (err) {
        setError("An error occurred. Please try again.");
        console.error('Error asking Octo:', err);
      } finally {
        setLoading(false);
      }
    },
    [pageContext],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      void handleAsk(input);
    }
  };

  const handleQuickAction = (action: string) => {
    void handleAsk(action);
  };

  return (
    <div className="octo-page">
      <div className="octo-page-header">
        <div className="octo-page-header-content">
          <div className="octo-page-icon">🐙</div>
          <div>
            <h1 className="octo-page-title">Octo</h1>
            <p className="octo-page-subtitle">Your OCTOPUS workspace assistant</p>
          </div>
        </div>
        <div className="octo-page-status">
          <div className="octo-status-indicator"></div>
          <span className="octo-status-text">Ready to help</span>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="octo-page-welcome">
          <div className="octo-welcome-icon">🐙</div>
          <h2 className="octo-welcome-title">Hi, I'm Octo</h2>
          <p className="octo-welcome-message">
            I can help you understand your projects, snapshots, Blueprints, and OCTOPUS workflows.
          </p>

          {summary && (
            <div className="octo-welcome-stats">
              <div className="octo-stat">
                <div className="octo-stat-value">{summary.projectCount}</div>
                <div className="octo-stat-label">Project{summary.projectCount !== 1 ? 's' : ''}</div>
              </div>
              <div className="octo-stat">
                <div className="octo-stat-value">{summary.snapshotCount}</div>
                <div className="octo-stat-label">Snapshot{summary.snapshotCount !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          <div className="octo-quick-actions">
            <div className="octo-quick-actions-label">Quick actions:</div>
            <div className="octo-quick-actions-grid">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="octo-quick-action-button"
                  onClick={() => handleQuickAction(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="octo-page-chat">
          <div className="octo-messages">
            {messages.map((message, index) => (
              <div key={index} className={`octo-message-container octo-message-${message.role}`}>
                <div className="octo-message-content">
                  {message.role === 'octo' && <div className="octo-message-avatar">🐙</div>}
                  <div className="octo-message-bubble">
                    <p className="octo-message-text">{message.content}</p>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="octo-message-container octo-message-loading">
                <div className="octo-message-content">
                  <div className="octo-message-avatar">🐙</div>
                  <div className="octo-message-bubble">
                    <div className="octo-loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="octo-message-error">
                <p>{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {summary && summary.suggestions.length > 0 && (
            <div className="octo-suggestions">
              <div className="octo-suggestions-label">Try asking:</div>
              <div className="octo-suggestions-grid">
                {summary.suggestions.slice(0, 4).map((suggestion) => (
                  <button
                    key={suggestion}
                    className="octo-suggestion-button"
                    onClick={() => handleAsk(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <form className="octo-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="octo-input"
          placeholder="Ask Octo about your OCTOPUS workspace..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="octo-send-button" disabled={loading || !input.trim()}>
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
