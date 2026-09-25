import type { SnapshotTreeNode } from '@octopus/shared';

export function buildDefaultExpandedPaths(nodes: SnapshotTreeNode[]) {
  return nodes
    .filter((node) => node.type === 'DIRECTORY')
    .map((node) => node.relativePath);
}

export function summarizeTree(nodes: SnapshotTreeNode[]) {
  let files = 0;
  let directories = 0;

  const visit = (node: SnapshotTreeNode) => {
    if (node.type === 'DIRECTORY') {
      directories += 1;
      node.children.forEach(visit);
      return;
    }

    files += 1;
  };

  nodes.forEach(visit);

  return {
    files,
    directories,
  };
}
