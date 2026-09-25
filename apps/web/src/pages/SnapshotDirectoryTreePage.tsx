import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { getSnapshotDirectoryTree, getSnapshotFileContent } from '../lib/snapshots/snapshots-client';
import { buildDefaultExpandedPaths, summarizeTree } from '../lib/snapshots/directory-tree-utils';
import type { SnapshotDirectoryTreeResponse, SnapshotFileContentResponse, SnapshotTreeNode } from '../lib/snapshots/types';

function statusTone(status: SnapshotDirectoryTreeResponse['status']) {
  if (status === 'COMPLETED') {
    return 'ok' as const;
  }

  if (status === 'FAILED') {
    return 'warn' as const;
  }

  return 'neutral' as const;
}

type TreeNodeProps = {
  node: SnapshotTreeNode;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelectFile: (node: SnapshotTreeNode) => void;
  selectedFilePath: string | null;
  depth: number;
};

function TreeNode({ node, expandedPaths, onToggle, onSelectFile, selectedFilePath, depth }: TreeNodeProps) {
  const isDirectory = node.type === 'DIRECTORY';
  const hasChildren = isDirectory && node.children.length > 0;
  const isExpanded = isDirectory && expandedPaths.has(node.relativePath);
  const isSelectedFile = !isDirectory && selectedFilePath === node.relativePath;

  return (
    <li>
      <div className="tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
        {isDirectory ? (
          <button
            className="tree-toggle"
            type="button"
            onClick={() => onToggle(node.relativePath)}
            disabled={!hasChildren}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
          </button>
        ) : (
          <span className="tree-toggle" aria-hidden="true">
            •
          </span>
        )}

        <span className="tree-icon" aria-hidden="true">
          {isDirectory ? '[D]' : '[F]'}
        </span>

        {isDirectory ? (
          <span className="tree-name">{node.name}</span>
        ) : (
          <button
            className={`tree-file-button${isSelectedFile ? ' tree-file-selected' : ''}`}
            type="button"
            onClick={() => onSelectFile(node)}
            aria-label={`Open file ${node.name}`}
          >
            {node.name}
          </button>
        )}

        {node.type === 'FILE' ? (
          <span className="tree-meta muted meta-sm">{node.sizeBytes ?? 0} bytes</span>
        ) : null}
      </div>

      {isDirectory && isExpanded && node.children.length > 0 ? (
        <ul className="tree-list">
          {node.children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              selectedFilePath={selectedFilePath}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SnapshotDirectoryTreePage() {
  const { projectId, snapshotId } = useParams();

  const [payload, setPayload] = useState<SnapshotDirectoryTreeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set<string>());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [filePayload, setFilePayload] = useState<SnapshotFileContentResponse | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isMobileViewerOpen, setIsMobileViewerOpen] = useState(false);
  const fileRequestSequenceRef = useRef(0);

  const loadDirectoryTree = async () => {
    if (!projectId || !snapshotId) {
      setError('Snapshot not found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getSnapshotDirectoryTree(projectId, snapshotId);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    setPayload(result.data);
    setExpandedPaths(new Set(buildDefaultExpandedPaths(result.data.directoryTree?.nodes ?? [])));
  };

  useEffect(() => {
    void loadDirectoryTree();
  }, [projectId, snapshotId]);

  const summary = useMemo(() => summarizeTree(payload?.directoryTree?.nodes ?? []), [payload]);

  const onToggle = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  const onSelectFile = async (node: SnapshotTreeNode) => {
    if (!projectId || !snapshotId || node.type !== 'FILE') {
      return;
    }

    const nextRequestId = fileRequestSequenceRef.current + 1;
    fileRequestSequenceRef.current = nextRequestId;

    setSelectedFilePath(node.relativePath);
    setSelectedFileName(node.name);
    setFilePayload(null);
    setFileError(null);
    setCopyFeedback(null);
    setIsFileLoading(true);

    if (window.matchMedia('(max-width: 768px)').matches) {
      setIsMobileViewerOpen(true);
    }

    const result = await getSnapshotFileContent(projectId, snapshotId, node.relativePath);
    if (fileRequestSequenceRef.current !== nextRequestId) {
      return;
    }

    setIsFileLoading(false);

    if (!result.success) {
      setFileError(result.error.message);
      return;
    }

    setFilePayload(result.data);
  };

  const onCopyFileContent = async () => {
    if (!filePayload?.file.content) {
      return;
    }

    if (!navigator.clipboard) {
      setCopyFeedback('Clipboard is unavailable in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(filePayload.file.content);
      setCopyFeedback('Copied preview content.');
    } catch {
      setCopyFeedback('Copy failed. Please try again.');
    }
  };

  const renderViewer = () => {
    if (isFileLoading) {
      return <LoadingState label="Loading file preview..." />;
    }

    if (fileError) {
      return <ErrorState title="File preview unavailable" message={fileError} />;
    }

    if (!selectedFilePath || !selectedFileName) {
      return (
        <EmptyState
          title="No file selected"
          message="Select a file from the directory tree to preview snapshot content."
        />
      );
    }

    if (!filePayload) {
      return <LoadingState label="Preparing file preview..." />;
    }

    const unsupportedMessages = {
      BINARY_FILE: 'This file appears to be binary and cannot be previewed as text.',
      UNSUPPORTED_FILE_TYPE: 'This file type is currently unsupported for text preview.',
      FILE_TOO_LARGE: 'This file exceeds the preview size limit.',
    } as const;

    if (!filePayload.file.supported || !filePayload.file.isText || filePayload.file.content === null) {
      return (
        <EmptyState
          title="Preview unavailable"
          message={
            unsupportedMessages[filePayload.file.unsupportedReason ?? 'UNSUPPORTED_FILE_TYPE'] ??
            'File preview is unavailable.'
          }
        />
      );
    }

    return (
      <div className="file-viewer-content">
        <div className="file-viewer-meta muted meta-sm">
          <span>Path: {filePayload.file.path}</span>
          <span>Size: {filePayload.file.sizeBytes} bytes</span>
          <span>Type: {filePayload.file.contentTypeGuess ?? 'text/plain'}</span>
          {filePayload.file.redactionApplied ? <span>Secrets detected and masked</span> : null}
        </div>

        <div className="project-actions file-viewer-actions">
          <Button type="button" variant="ghost" onClick={() => void onCopyFileContent()}>
            Copy
          </Button>
          {copyFeedback ? <span className="muted meta-sm">{copyFeedback}</span> : null}
        </div>

        <pre className="file-viewer-pre" aria-label={`Preview for ${filePayload.file.fileName}`}>
          <code>{filePayload.file.content}</code>
        </pre>
      </div>
    );
  };

  if (isLoading) {
    return <LoadingState label="Loading directory tree..." />;
  }

  if (error) {
    return <ErrorState title="Directory tree unavailable" message={error} />;
  }

  if (!payload) {
    return <EmptyState title="Directory tree unavailable" message="No directory tree data found for this snapshot." />;
  }

  if (payload.status === 'FAILED') {
    return (
      <ErrorState
        title="Snapshot processing failed"
        message={payload.failureReason ?? 'Directory tree could not be generated for this snapshot.'}
      />
    );
  }

  if (payload.status !== 'COMPLETED') {
    return <LoadingState label={`Snapshot is ${payload.status.toLowerCase()}. Directory tree will be available when processing completes.`} />;
  }

  if (!payload.directoryTree || payload.directoryTree.nodes.length === 0) {
    return (
      <EmptyState
        title="No directory entries"
        message="The snapshot archive was processed but no directory or file entries were found."
      />
    );
  }

  return (
    <>
      <Card>
        <div className="row-between">
          <div>
            <h3 className="card-title">Directory Tree</h3>
            <p className="muted body-sm">Snapshot {payload.snapshotId}</p>
          </div>
          <Badge tone={statusTone(payload.status)}>{payload.status}</Badge>
        </div>

        <div className="project-meta muted meta-sm">
          <span>Entries: {payload.directoryTree.totalEntries}</span>
          <span>Directories: {payload.directoryTree.totalDirectories}</span>
          <span>Files: {payload.directoryTree.totalFiles}</span>
          <span>Total size: {payload.directoryTree.totalSizeBytes} bytes</span>
          <span>Generated: {new Date(payload.directoryTree.generatedAt).toLocaleString()}</span>
        </div>

        <div className="project-actions">
          <Button type="button" variant="secondary" onClick={() => void loadDirectoryTree()}>
            Refresh
          </Button>
          <Link className="btn btn-ghost" to={`/projects/${projectId}/snapshots/${snapshotId}`}>
            Back to snapshot
          </Link>
        </div>
      </Card>

      <Card>
        <div className={`snapshot-file-layout${isMobileViewerOpen ? ' mobile-viewer-open' : ''}`}>
          <section className="snapshot-tree-pane" aria-label="Snapshot directory tree pane">
            <div className="row-between">
              <h4 className="card-title">Tree Structure</h4>
              <p className="muted meta-sm">
                {summary.directories} folders · {summary.files} files
              </p>
            </div>

            <ul className="tree-list" aria-label="Snapshot directory tree">
              {payload.directoryTree.nodes.map((node) => (
                <TreeNode
                  key={node.relativePath}
                  node={node}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  onSelectFile={onSelectFile}
                  selectedFilePath={selectedFilePath}
                  depth={0}
                />
              ))}
            </ul>
          </section>

          <section className="snapshot-viewer-pane" aria-label="Snapshot file preview pane">
            <div className="row-between">
              <div>
                <h4 className="card-title">File Viewer</h4>
                <p className="muted body-sm">{selectedFilePath ?? 'Select a file to preview snapshot content'}</p>
              </div>

              {isMobileViewerOpen ? (
                <Button type="button" variant="secondary" onClick={() => setIsMobileViewerOpen(false)}>
                  Back
                </Button>
              ) : null}
            </div>

            {renderViewer()}
          </section>
        </div>
      </Card>
    </>
  );
}
