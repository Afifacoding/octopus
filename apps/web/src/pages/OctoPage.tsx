import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approveOctoPatch,
  askOcto,
  getOctoGraph,
  getOctoSummary,
  rejectOctoPatch,
} from '../lib/octo/octo-client';
import type {
  OctoAskRequest,
  OctoIntelligencePayload,
  OctoPatchProposal,
  OctoProjectGraph,
  OctoSummary,
} from '../lib/octo/octo-client';
import { buildCompareSnapshotOptions, defaultComparePair } from '../lib/octo/octo-intelligence';
import { OctoIntelligenceCard } from '../components/octo/OctoIntelligenceCard';
import type { OctoPageContext } from '@octopus/shared';

type Message = {
  role: 'user' | 'octo';
  content: string;
  timestamp: Date;
  image?: string;
  patchProposal?: OctoPatchProposal;
  intelligence?: OctoIntelligencePayload;
};

type OctobotMode = 'learn' | 'debug' | 'dsa' | 'code-review' | 'interview' | 'project-assistant';

const MODES: Array<{ value: OctobotMode; label: string }> = [
  { value: 'learn', label: 'Learn' },
  { value: 'debug', label: 'Debug' },
  { value: 'dsa', label: 'DSA' },
  { value: 'code-review', label: 'Review' },
  { value: 'interview', label: 'Interview' },
  { value: 'project-assistant', label: 'Project' },
];

const QUICK_SUGGESTIONS = [
  'Show my projects',
  'How many snapshots are in each project?',
  'Which project has the most snapshots?',
  'Compare my latest two snapshots',
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
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [mode, setMode] = useState<OctobotMode>('learn');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [graph, setGraph] = useState<OctoProjectGraph | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphSearch, setGraphSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [pathStart, setPathStart] = useState('');
  const [pathEnd, setPathEnd] = useState('');
  const [tracedPath, setTracedPath] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState('');
  const [compareTargetId, setCompareTargetId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pageContext: OctoPageContext = 'DASHBOARD';
  const selectedProject = summary?.projects.find((project) => project.id === selectedProjectId);
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId);
  const compareOptions = buildCompareSnapshotOptions(selectedProject?.snapshots || []);
  const canCompare = compareOptions.length >= 2;

  // Load initial summary
  useEffect(() => {
    const loadSummary = async () => {
      const result = await getOctoSummary();
      setSummary(result);
      const defaultProject = result?.projects.find((project) => project.snapshots.length > 0) || result?.projects[0];
      if (defaultProject) {
        setSelectedProjectId((current) => current || defaultProject.id);
        setSelectedSnapshotId((current) => current || defaultProject.snapshots[0]?.id || '');
      }
    };

    void loadSummary();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAsk = useCallback(
    async (question: string, image: string | null = null, compare?: OctoAskRequest['compare']) => {
      if (!question.trim() && !image) return;
      const prompt = question.trim() || 'Please inspect this screenshot and explain the issue.';

      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: prompt,
        timestamp: new Date(),
        ...(image ? { image } : {}),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        const response = await askOcto({
          question: prompt,
          pageContext,
          mode,
          ...(image ? { images: [image] } : {}),
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
          ...(selectedSnapshotId ? { snapshotId: selectedSnapshotId } : {}),
          ...(compare ? { compare } : {}),
          history: messages.slice(-8).map((message) => ({
            role: message.role === 'octo' ? 'assistant' : 'user',
            content: message.content.slice(-8000),
          })),
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
          ...(response.patchProposal ? { patchProposal: response.patchProposal } : {}),
          ...(response.intelligence ? { intelligence: response.intelligence } : {}),
        };

        setMessages((prev) => [...prev, octoMessage]);
        setAttachedImage(null);

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
    [messages, mode, pageContext, selectedProjectId, selectedSnapshotId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || attachedImage) {
      void handleAsk(input, attachedImage);
    }
  };

  const handleQuickAction = (action: string) => {
    void handleAsk(action);
  };

  const resolvePatchProposal = (patchId: string) => {
    setMessages((current) => current.map((message) => {
      if (message.patchProposal?.patchId !== patchId) return message;
      const resolved = { ...message };
      delete resolved.patchProposal;
      return resolved;
    }));
  };

  const handleApprovePatch = async (proposal: OctoPatchProposal) => {
    setLoading(true);
    const snapshot = await approveOctoPatch(proposal.patchId);
    if (!snapshot) {
      setError('OCTOBOT could not create the derived snapshot. The original snapshot remains unchanged.');
      setLoading(false);
      return;
    }

    resolvePatchProposal(proposal.patchId);
    setSelectedSnapshotId(snapshot.id);
    const refreshedSummary = await getOctoSummary();
    if (refreshedSummary) setSummary(refreshedSummary);
    setMessages((current) => [...current, {
      role: 'octo',
      content: `Patch approved. OCTO created a new snapshot (${snapshot.id}); the source snapshot was preserved.`,
      timestamp: new Date(),
    }]);
    setLoading(false);
  };

  const handleRejectPatch = async (proposal: OctoPatchProposal) => {
    setLoading(true);
    const rejected = await rejectOctoPatch(proposal.patchId);
    if (!rejected) {
      setError('Could not dismiss this patch proposal.');
      setLoading(false);
      return;
    }
    resolvePatchProposal(proposal.patchId);
    setMessages((current) => [...current, {
      role: 'octo',
      content: 'Patch proposal dismissed. No snapshot was changed.',
      timestamp: new Date(),
    }]);
    setLoading(false);
  };

  const handleProjectChange = (projectId: string) => {
    const project = summary?.projects.find((item) => item.id === projectId);
    setSelectedProjectId(projectId);
    setSelectedSnapshotId(project?.snapshots[0]?.id || '');
    setGraph(null);
    const pair = defaultComparePair(buildCompareSnapshotOptions(project?.snapshots || []));
    setCompareBaseId(pair?.baseSnapshotId || '');
    setCompareTargetId(pair?.targetSnapshotId || '');
    if (!pair) setCompareOpen(false);
  };

  const openCompare = () => {
    const pair = defaultComparePair(compareOptions);
    const hasValidSelection = [compareBaseId, compareTargetId].every((id) => compareOptions.some((option) => option.id === id));
    if (!hasValidSelection && pair) {
      setCompareBaseId(pair.baseSnapshotId);
      setCompareTargetId(pair.targetSnapshotId);
    }
    setCompareOpen(true);
  };

  const runCompare = () => {
    const base = compareOptions.find((option) => option.id === compareBaseId);
    const target = compareOptions.find((option) => option.id === compareTargetId);
    if (!selectedProject || !base || !target || base.id === target.id) return;
    void handleAsk(
      `Compare snapshot ${base.number} and snapshot ${target.number} of ${selectedProject.name}`,
      null,
      { baseSnapshotId: base.id, targetSnapshotId: target.id },
    );
  };

  const handleImageFile = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 700_000) {
      setError('Choose a PNG, JPEG, or WebP image smaller than 700 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(typeof reader.result === 'string' ? reader.result : null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    handleImageFile(file);
  };

  const loadGraph = async () => {
    if (!selectedProjectId || !selectedSnapshotId) return;
    setGraphLoading(true);
    setGraphOpen(true);
    setError(null);
    const result = await getOctoGraph(selectedProjectId, selectedSnapshotId);
    setGraph(result);
    setSelectedNodeId(result?.godNodes[0]?.id || result?.nodes[0]?.id || '');
    setGraphLoading(false);
    if (!result) setError('Graphify could not load this snapshot.');
  };

  const tracePath = () => {
    if (!graph || !pathStart || !pathEnd) return;
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
    }
    const queue: Array<{ node: string; path: string[] }> = [{ node: pathStart, path: [pathStart] }];
    const visited = new Set([pathStart]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      if (current.node === pathEnd) {
        setTracedPath(current.path);
        return;
      }
      for (const neighbor of adjacency.get(current.node) || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...current.path, neighbor] });
      }
    }
    setTracedPath([]);
  };

  const filteredNodes = graph?.nodes.filter((node) =>
    `${node.label} ${node.filePath} ${node.type}`.toLowerCase().includes(graphSearch.toLowerCase()),
  ).slice(0, 100) || [];

  return (
    <div className="octo-page">
      <div className="octo-page-header">
        <div className="octo-page-header-content">
          <div className="octo-page-icon">🐙</div>
          <div>
            <h1 className="octo-page-title">OCTOBOT</h1>
            <p className="octo-page-subtitle">Your OCTOPUS assistant, powered by OCTOBOT</p>
          </div>
        </div>
        <div className="octo-header-tools">
          <label className="octo-select-label">
            Project
            <select value={selectedProjectId} onChange={(event) => handleProjectChange(event.target.value)}>
              <option value="">General assistant</option>
              {(summary?.projects || []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="octo-select-label">
            Snapshot
            <select
              value={selectedSnapshotId}
              onChange={(event) => setSelectedSnapshotId(event.target.value)}
              disabled={!selectedProject?.snapshots.length}
            >
              <option value="">No completed snapshot</option>
              {(selectedProject?.snapshots || []).map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {new Date(snapshot.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="octo-toolbar-button"
            onClick={loadGraph}
            disabled={!selectedProjectId || !selectedSnapshotId || graphLoading}
          >
            {graphLoading ? 'Building graph...' : 'Graphify'}
          </button>
          <button
            type="button"
            className="octo-toolbar-button"
            onClick={openCompare}
            disabled={!canCompare || loading}
            title={canCompare ? 'Compare two completed snapshots' : 'Select a project with at least two completed snapshots'}
          >
            Compare
          </button>
          <div className="octo-page-status">
            <div className={`octo-status-indicator ${summary?.assistantMode === 'offline' ? 'is-offline' : ''}`}></div>
            <span className="octo-status-text">
              {summary?.assistantMode === 'live' ? 'OCTOBOT online' : 'AI provider required'}
            </span>
          </div>
        </div>
      </div>

      {graphOpen && (
        <section className="octo-graph-panel" aria-label="Graphify project knowledge graph">
          <div className="octo-graph-heading">
            <div>
              <h2>Graphify</h2>
              <p>{selectedProject?.name || 'Selected project'} · snapshot-derived architecture</p>
            </div>
            <button type="button" className="octo-toolbar-button" onClick={() => setGraphOpen(false)}>Close</button>
          </div>
          {graphLoading && <p className="octo-graph-empty">Building the snapshot knowledge graph...</p>}
          {graph && (
            <>
              <div className="octo-graph-metrics">
                <span>{graph.metrics.totalNodes} entities</span>
                <span>{graph.metrics.totalEdges} relationships</span>
                <span>{graph.godNodes.length} high-coupling nodes</span>
              </div>
              <p className="octo-graph-summary">{graph.report.summary}</p>
              <div className="octo-graph-grid">
                <div className="octo-graph-list">
                  <input
                    value={graphSearch}
                    onChange={(event) => setGraphSearch(event.target.value)}
                    placeholder="Search files, symbols, endpoints"
                    aria-label="Search graph nodes"
                  />
                  <div className="octo-graph-nodes">
                    {filteredNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        className={selectedNodeId === node.id ? 'is-selected' : ''}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        <strong>{node.label}</strong><span>{node.filePath}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="octo-graph-detail">
                  {selectedNode && (
                    <>
                      <h3>{selectedNode.label}</h3>
                      <p>{selectedNode.filePath} · {selectedNode.type}</p>
                      <p>Inbound {selectedNode.metrics.inDegree} · Outbound {selectedNode.metrics.outDegree} · Centrality {selectedNode.metrics.centralityScore}</p>
                      <h3>Architecture layers</h3>
                      <ul>{graph.clusters.map((cluster) => (
                        <li key={cluster.name}>{cluster.name}: {cluster.nodeIds.length} entities</li>
                      ))}</ul>
                      <h3>Trace dependency path</h3>
                      <div className="octo-path-controls">
                        <select aria-label="Path start" value={pathStart} onChange={(event) => setPathStart(event.target.value)}>
                          <option value="">From entity</option>
                          {graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
                        </select>
                        <select aria-label="Path end" value={pathEnd} onChange={(event) => setPathEnd(event.target.value)}>
                          <option value="">To entity</option>
                          {graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
                        </select>
                        <button type="button" onClick={tracePath} disabled={!pathStart || !pathEnd}>Trace</button>
                      </div>
                      {tracedPath.length > 0 && <p className="octo-traced-path">{tracedPath.join(' → ')}</p>}
                      {tracedPath.length === 0 && pathStart && pathEnd && <p className="octo-graph-empty">No path found.</p>}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {compareOpen && canCompare && (
        <section className="octo-graph-panel octo-compare-panel" aria-label="Compare snapshots">
          <div className="octo-graph-heading">
            <div>
              <h2>Compare snapshots</h2>
              <p>{selectedProject?.name} · file-level changes verified from snapshot archives</p>
            </div>
            <button type="button" className="octo-toolbar-button" onClick={() => setCompareOpen(false)}>Close</button>
          </div>
          <div className="octo-compare-controls">
            <label className="octo-select-label">
              From (base)
              <select value={compareBaseId} onChange={(event) => setCompareBaseId(event.target.value)}>
                {compareOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <span className="octo-compare-arrow" aria-hidden="true">→</span>
            <label className="octo-select-label">
              To (target)
              <select value={compareTargetId} onChange={(event) => setCompareTargetId(event.target.value)}>
                {compareOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="octo-toolbar-button is-primary"
              onClick={runCompare}
              disabled={loading || !compareBaseId || !compareTargetId || compareBaseId === compareTargetId}
            >
              {loading ? 'Comparing...' : 'Run comparison'}
            </button>
          </div>
          {compareBaseId && compareBaseId === compareTargetId && (
            <p className="octo-graph-empty">Choose two different snapshots.</p>
          )}
        </section>
      )}

      {messages.length === 0 && (
        <div className="octo-page-welcome">
          <div className="octo-welcome-icon">🐙</div>
          <h2 className="octo-welcome-title">Hi, I'm OCTOBOT</h2>
          <p className="octo-welcome-message">
            I can help with software development and your OCTOPUS projects, snapshots, and Blueprints.
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
                    {message.image && <img className="octo-message-image" src={message.image} alt="User attachment" />}
                    <p className="octo-message-text">{message.content}</p>
                    {message.intelligence && <OctoIntelligenceCard payload={message.intelligence} />}
                    {message.patchProposal && (
                      <div className="octo-patch-proposal">
                        <div className="octo-patch-heading">
                          <div>
                            <strong>{message.patchProposal.summary}</strong>
                            <span>{message.patchProposal.filePath}</span>
                          </div>
                          <span>+{message.patchProposal.additions} / -{message.patchProposal.deletions}</span>
                        </div>
                        <pre>{message.patchProposal.diff}</pre>
                        <div className="octo-patch-actions">
                          <button type="button" disabled={loading} onClick={() => void handleApprovePatch(message.patchProposal!)}>
                            Approve and create snapshot
                          </button>
                          <button type="button" disabled={loading} onClick={() => void handleRejectPatch(message.patchProposal!)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
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
        <div className="octo-mode-toolbar" role="group" aria-label="Assistant mode">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              className={mode === item.value ? 'is-active' : ''}
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="octo-attach-button" onClick={() => fileInputRef.current?.click()}>
            Attach screenshot
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => handleImageFile(event.target.files?.[0])}
          />
        </div>
        {attachedImage && (
          <div className="octo-attachment-preview">
            <img src={attachedImage} alt="Screenshot preview" />
            <span>Screenshot ready for visual analysis</span>
            <button type="button" onClick={() => setAttachedImage(null)}>Remove</button>
          </div>
        )}
        <div className="octo-input-row">
          <textarea
            className="octo-input"
            placeholder="Ask OCTOBOT, or paste a screenshot..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={handlePaste}
            disabled={loading}
            rows={2}
          />
          <button type="submit" className="octo-send-button" disabled={loading || (!input.trim() && !attachedImage)}>
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
