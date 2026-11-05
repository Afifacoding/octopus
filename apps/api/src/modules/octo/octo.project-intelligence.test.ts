import { describe, expect, it } from 'vitest';
import { OctoProjectIntelligence } from './octo.project-intelligence.js';

describe('OctoProjectIntelligence', () => {
  const intelligence = new OctoProjectIntelligence('project-1', 'snapshot-1', [
    {
      path: 'project/src/routes/app.ts',
      content: "import { AppService } from '../services/app.js';\nrouter.get('/app', appService.getApp);",
    },
    {
      path: 'project/src/services/app.ts',
      content: "import { Repository } from '../repositories/app.js';\nexport class AppService {\n  getApp() { return new Repository().findApp(); }\n}",
    },
    {
      path: 'project/src/repositories/app.ts',
      content: 'export class Repository {\n  findApp() { return { id: 1 }; }\n}',
    },
  ]);

  it('builds import edges, architecture clusters, and centrality metrics', () => {
    const graph = intelligence.buildGraph();

    expect(graph.edges).toContainEqual({
      source: 'project/src/routes/app.ts',
      target: 'project/src/services/app.ts',
      type: 'imports',
    });
    expect(graph.metrics.totalNodes).toBeGreaterThan(3);
    expect(graph.clusters.find((cluster) => cluster.name === 'Presentation & API')?.nodeIds)
      .toContain('project/src/routes/app.ts');
    expect(graph.nodes.find((node) => node.id === 'project/src/services/app.ts')?.metrics.outDegree)
      .toBeGreaterThan(0);
  });

  it('retrieves relevant snippets and traces dependency paths', () => {
    const snippets = intelligence.retrieveContext('repositories findApp');

    expect(snippets[0]?.relativePath).toBe('project/src/repositories/app.ts');
    expect(snippets[0]?.content).toContain('findApp');
    expect(intelligence.findPath('project/src/routes/app.ts', 'project/src/repositories/app.ts'))
      .toEqual(['project/src/routes/app.ts', 'project/src/services/app.ts', 'project/src/repositories/app.ts']);
  });
});