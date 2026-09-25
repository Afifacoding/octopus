import { describe, expect, it } from 'vitest';

import { buildDefaultExpandedPaths, summarizeTree } from './directory-tree-utils';

describe('directory-tree utils', () => {
  const nodes = [
    {
      name: 'project',
      relativePath: 'project',
      type: 'DIRECTORY' as const,
      sizeBytes: null,
      children: [
        {
          name: 'src',
          relativePath: 'project/src',
          type: 'DIRECTORY' as const,
          sizeBytes: null,
          children: [
            {
              name: 'App.tsx',
              relativePath: 'project/src/App.tsx',
              type: 'FILE' as const,
              sizeBytes: 10,
              children: [],
            },
          ],
        },
      ],
    },
  ];

  it('expands top-level directories by default', () => {
    expect(buildDefaultExpandedPaths(nodes)).toEqual(['project']);
  });

  it('summarizes files and directories from nested tree', () => {
    expect(summarizeTree(nodes)).toEqual({ files: 1, directories: 2 });
  });
});
