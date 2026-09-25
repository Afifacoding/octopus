import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchInput } from '../../components/ui/SearchInput';
import { listProjects } from '../../lib/projects/projects-client';
import { listSnapshots } from '../../lib/snapshots/snapshots-client';
import {
  buildSnapshotSearchEntries,
  filterSnapshotSearchEntries,
  type SnapshotSearchEntry,
} from '../../lib/snapshots/snapshot-search';
import type { SnapshotRecord } from '../../lib/snapshots/types';

export function SnapshotSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<SnapshotSearchEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const projectsResult = await listProjects({ status: 'ACTIVE' });
      if (cancelled || !projectsResult.success) {
        return;
      }

      const projects = projectsResult.data.projects;
      const snapshotResults = await Promise.all(projects.map((project) => listSnapshots(project.id)));

      if (cancelled) {
        return;
      }

      const snapshotsByProjectId: Record<string, SnapshotRecord[]> = {};
      projects.forEach((project, index) => {
        const result = snapshotResults[index];
        snapshotsByProjectId[project.id] = result?.success ? result.data.snapshots : [];
      });

      setEntries(buildSnapshotSearchEntries(projects, snapshotsByProjectId));
      setIsLoaded(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const results = useMemo(() => filterSnapshotSearchEntries(entries, query), [entries, query]);

  const onSelect = (entry: SnapshotSearchEntry) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/projects/${entry.projectId}/snapshots/${entry.snapshotId}`);
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="snapshot-search" ref={containerRef}>
      <SearchInput
        placeholder="Search snapshots..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
          }

          if (event.key === 'Enter' && results[0]) {
            onSelect(results[0]);
          }
        }}
      />

      {isOpen && hasQuery ? (
        <div className="snapshot-search-results" role="listbox">
          {results.length > 0 ? (
            results.map((entry) => (
              <button
                key={entry.snapshotId}
                type="button"
                role="option"
                aria-selected={false}
                className="snapshot-search-result"
                onClick={() => onSelect(entry)}
              >
                <span className="snapshot-search-result-title">{entry.label}</span>
                <span className="muted meta-sm">
                  {entry.projectName} · {entry.captureSource} · {entry.createdAtLabel}
                </span>
              </button>
            ))
          ) : (
            <p className="snapshot-search-empty muted meta-sm">
              {isLoaded && entries.length === 0 ? 'No snapshots yet' : 'No snapshots found'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
