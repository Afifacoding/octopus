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

  it('uses the TypeScript AST for symbols, imports, calls, exports and API routes', () => {
    const graph = new OctoProjectIntelligence('project-1', 'snapshot-2', [
      {
        path: 'src/auth.ts',
        content: [
          "import { verify } from './barrel.js';",
          'export interface Authenticatable {}',
          'export class BaseAuth {}',
          'export class AuthService extends BaseAuth implements Authenticatable {',
          '  login() { verify(); }',
          '}',
          'export function authenticate() { loginHelper(); }',
          'function loginHelper() {}',
          "router.post('/auth/login', authenticate);",
        ].join('\n'),
      },
      { path: 'src/barrel.ts', content: "export { verifyUser as verify } from './users.js';" },
      { path: 'src/users.ts', content: 'export function verifyUser() {}' },
    ]).buildGraph();

    expect(graph.edges).toContainEqual({ source: 'src/auth.ts', target: 'src/barrel.ts', type: 'imports' });
    expect(graph.edges.some((edge) => edge.source === 'src/barrel.ts' && edge.target.includes('verifyUser') && edge.type === 'exports')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'exports' && edge.target.includes('AuthService'))).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'calls' && edge.target.includes('verifyUser'))).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'extends' && edge.target.includes('BaseAuth'))).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'implements' && edge.target.includes('Authenticatable'))).toBe(true);
    expect(graph.nodes.some((node) => node.type === 'endpoint' && node.label === 'POST /auth/login')).toBe(true);
    expect(graph.analysis).toMatchObject({
      status: 'COMPLETE',
      supportedLanguages: ['TypeScript'],
      parsedFileCount: 3,
      malformedFileCount: 0,
    });
  });

  it('resolves calls through a statically imported namespace without guessing arbitrary property calls', () => {
    const graph = new OctoProjectIntelligence('project-1', 'namespace-imports', [
      {
        path: 'src/main.ts',
        content: "import * as math from './math.js';\nexport function calculate() { return math.add(1, 2); }\nexport function unrelated(value: { add(): void }) { value.add(); }",
      },
      { path: 'src/math.ts', content: 'export function add(left: number, right: number) { return left + right; }' },
    ]).buildGraph();

    expect(graph.edges).toContainEqual({
      source: 'src/main.ts::calculate@2',
      target: 'src/math.ts::add@1',
      type: 'calls',
    });
    expect(graph.edges.some((edge) => edge.source === 'src/main.ts::unrelated@3' && edge.type === 'calls')).toBe(false);
  });

  it('parses JavaScript and JSX components, while reporting unsupported and malformed files', () => {
    const graph = new OctoProjectIntelligence('project-1', 'snapshot-3', [
      { path: 'src/client.js', content: 'function helper() {} export function client() { helper(); }' },
      { path: 'src/View.jsx', content: 'export const View = () => <Button />; export const Button = () => <div />;' },
      { path: 'src/broken.ts', content: 'export function {' },
      { path: 'src/worker.py', content: 'def run(): pass' },
    ]).buildGraph();

    expect(graph.nodes.some((node) => node.label === 'View' && node.type === 'component')).toBe(true);
    expect(graph.nodes.some((node) => node.label === 'worker.py' && node.type === 'file')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'uses_component')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'calls' && edge.target.includes('helper'))).toBe(true);
    expect(graph.analysis).toMatchObject({
      status: 'PARTIAL',
      supportedLanguages: ['JavaScript', 'TypeScript'],
      parsedFileCount: 2,
      unsupportedFileCount: 1,
      malformedFileCount: 1,
    });
  });

  it('reports source truncation and caps graph nodes for large inputs', () => {
    const declarations = Array.from({ length: 10_100 }, (_, index) => `function f${index}(){}`).join('\n');
    const graph = new OctoProjectIntelligence(
      'project-1',
      'snapshot-4',
      [{ path: 'src/large.ts', content: declarations }],
      true,
    ).buildGraph();

    expect(graph.nodes.length).toBeLessThanOrEqual(10_000);
    expect(graph.analysis.status).toBe('PARTIAL');
    expect(graph.analysis.sourceTruncated).toBe(true);
    expect(graph.analysis.graphTruncated).toBe(true);
  }, 15_000);
});