import path from 'node:path';

import type { AssistantSourceFile } from './octo.project-intelligence.js';

export type ProjectStackEvidence = {
  languages: Array<{ name: string; fileCount: number }>;
  frameworks: string[];
  packageManagers: string[];
  buildSystems: string[];
  databases: string[];
  deploymentConfiguration: string[];
  configurationPaths: string[];
  manifestPaths: string[];
};

export type PlatformRecommendation = {
  id: string;
  category: 'WEB_HOSTING' | 'API_HOSTING' | 'DATABASE' | 'TESTING';
  title: string;
  whyItFits: string;
  benefits: string[];
  limitations: string[];
  integrationComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  alternatives: string[];
  evidence: string[];
  compatibilityNotes: string[];
};

export type ProjectRecommendations = {
  projectId: string;
  snapshotId: string;
  analysisStatus: 'COMPLETE' | 'PARTIAL';
  stack: ProjectStackEvidence;
  recommendations: PlatformRecommendation[];
  pricingAndAvailability: 'NOT_VERIFIED';
};

const FRAMEWORKS: Record<string, string> = {
  react: 'React',
  'react-dom': 'React DOM',
  vite: 'Vite',
  fastify: 'Fastify',
  express: 'Express',
  next: 'Next.js',
  vue: 'Vue',
  '@nestjs/core': 'NestJS',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma Client',
  vitest: 'Vitest',
  jest: 'Jest',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
};

function parseManifest(file: AssistantSourceFile): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(file.content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function detectEvidence(files: AssistantSourceFile[]): ProjectStackEvidence {
  const languageCounts = new Map<string, number>();
  const manifests = files.filter((file) => path.posix.basename(file.path).toLowerCase() === 'package.json');
  const manifestData = manifests.flatMap((file) => {
    const parsed = parseManifest(file);
    return parsed ? [{ file, parsed }] : [];
  });
  const dependencyNames = new Set<string>();
  const scripts = new Set<string>();
  const packageManagers = new Set<string>();

  for (const { file, parsed } of manifestData) {
    const dependencies = {
      ...recordOf(parsed.dependencies),
      ...recordOf(parsed.devDependencies),
      ...recordOf(parsed.peerDependencies),
    };
    for (const name of Object.keys(dependencies)) dependencyNames.add(name);
    for (const name of Object.keys(recordOf(parsed.scripts))) scripts.add(name);

    const packageManager = typeof parsed.packageManager === 'string'
      ? parsed.packageManager.match(/^(npm|pnpm|yarn|bun)(?:@[\d.]+)?$/i)?.[1]?.toLowerCase()
      : undefined;
    if (packageManager) packageManagers.add(packageManager);
    const manifestDir = path.posix.dirname(file.path);
    const lowerPaths = new Set(files.map((item) => item.path.toLowerCase()));
    for (const manager of ['npm', 'pnpm', 'yarn', 'bun']) {
      const lockNames = {
        npm: 'package-lock.json',
        pnpm: 'pnpm-lock.yaml',
        yarn: 'yarn.lock',
        bun: 'bun.lockb',
      };
      const lockName = lockNames[manager as keyof typeof lockNames];
      const lock = manifestDir === '.' ? lockName : path.posix.join(manifestDir, lockName);
      if (lowerPaths.has(lock.toLowerCase())) packageManagers.add(manager);
    }
  }

  for (const file of files) {
    const extension = path.posix.extname(file.path).toLowerCase();
    const language = extension === '.ts' || extension === '.tsx'
      ? 'TypeScript'
      : extension === '.js' || extension === '.jsx'
        ? 'JavaScript'
        : extension === '.py'
          ? 'Python'
          : null;
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }

  const frameworks = [...dependencyNames]
    .filter((name) => FRAMEWORKS[name])
    .map((name) => FRAMEWORKS[name]!)
    .sort();
  const buildSystems = [
    ...(dependencyNames.has('vite') ? ['Vite'] : []),
    ...(dependencyNames.has('typescript') || scripts.has('typecheck') ? ['TypeScript compiler'] : []),
    ...(scripts.has('build') ? ['package.json build script'] : []),
  ];
  const databaseProviders = new Set<string>();
  const prismaSchemas = files.filter((file) => path.posix.extname(file.path).toLowerCase() === '.prisma');
  for (const file of prismaSchemas) {
    const provider = file.content.match(/\bdatasource\s+\w+\s*\{[\s\S]*?\bprovider\s*=\s*["'](postgresql|mysql|sqlite|mongodb|sqlserver|cockroachdb)["']/i)?.[1];
    if (provider) databaseProviders.add(provider.toLowerCase());
  }
  if (dependencyNames.has('@prisma/client') || dependencyNames.has('prisma')) databaseProviders.add('Prisma ORM (provider not verified)');
  if (dependencyNames.has('pg')) databaseProviders.add('PostgreSQL client');
  if (dependencyNames.has('mysql2')) databaseProviders.add('MySQL client');
  if (dependencyNames.has('better-sqlite3') || dependencyNames.has('sqlite3')) databaseProviders.add('SQLite client');

  const deploymentConfiguration = files
    .map((file) => file.path)
    .filter((filePath) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|render\.ya?ml|vercel\.json|railway\.json|netlify\.toml|fly\.toml|Procfile)$/i.test(filePath))
    .sort();
  const configurationPaths = files
    .map((file) => file.path)
    .filter((filePath) =>
      path.posix.extname(filePath).toLowerCase() === '.prisma' ||
      /(^|\/)(Dockerfile|docker-compose\.ya?ml|render\.ya?ml|vercel\.json|railway\.json|netlify\.toml|fly\.toml|Procfile)$/i.test(filePath))
    .sort();

  return {
    languages: [...languageCounts.entries()]
      .map(([name, fileCount]) => ({ name, fileCount }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    frameworks,
    packageManagers: [...packageManagers].sort(),
    buildSystems: [...new Set(buildSystems)].sort(),
    databases: [...databaseProviders].sort(),
    deploymentConfiguration,
    configurationPaths,
    manifestPaths: manifestData.map(({ file }) => file.path).sort(),
  };
}

function buildRecommendations(stack: ProjectStackEvidence): PlatformRecommendation[] {
  const recommendations: PlatformRecommendation[] = [];
  const hasReactVite = stack.frameworks.includes('React') && stack.frameworks.includes('Vite');
  const hasFastify = stack.frameworks.includes('Fastify');
  const hasVitest = stack.frameworks.includes('Vitest');
  const hasBuild = stack.buildSystems.includes('package.json build script');
  if (hasReactVite && hasBuild) {
    recommendations.push({
      id: 'vite-static-web',
      category: 'WEB_HOSTING',
      title: 'Deploy the Vite web build as a separate static site',
      whyItFits: 'The snapshot contains React and Vite dependencies plus a package build script, which supports a static web build. Keep the API deployment separate unless project configuration proves a combined runtime.',
      benefits: ['Uses the detected web build tool', 'Separates browser assets from the server API'],
      limitations: ['This snapshot does not prove that the build output is deployable without additional runtime configuration', 'API base URL and routing behavior must be configured for the chosen host'],
      integrationComplexity: 'MEDIUM',
      alternatives: ['Vercel or Netlify as candidates; current support and project compatibility are not verified', 'Any static file host after validating the generated build'],
      evidence: stack.manifestPaths,
      compatibilityNotes: ['No platform was tested. Verify monorepo root directory, build command, output directory, SPA fallback, environment configuration, and API connectivity before choosing a host.'],
    });
  }

  if (hasFastify) {
    recommendations.push({
      id: 'node-api-host',
      category: 'API_HOSTING',
      title: 'Run the Fastify API on a Node.js application host',
      whyItFits: 'The snapshot includes Fastify as an application dependency. A Node.js server host fits this runtime model better than static hosting.',
      benefits: ['Keeps the API server runtime separate from web assets', 'Allows normal Node process startup and health checks'],
      limitations: ['The snapshot does not verify host support for the project’s exact Node version, workspace startup, storage, or network settings'],
      integrationComplexity: 'MEDIUM',
      alternatives: ['Render or Railway as unverified candidates', 'Self-managed Node.js hosting'],
      evidence: stack.manifestPaths,
      compatibilityNotes: ['Confirm the Node engine, workspace-specific build/start commands, persistent storage needs, and connectivity to the database. No platform compatibility was tested.'],
    });
  }

  if (stack.databases.some((database) => database === 'postgresql' || database === 'PostgreSQL client')) {
    recommendations.push({
      id: 'postgres-managed-db',
      category: 'DATABASE',
      title: 'Use a managed PostgreSQL service only if the deployment requires managed operations',
      whyItFits: 'A PostgreSQL provider is explicitly present in the Prisma datasource or a PostgreSQL client dependency in the snapshot.',
      benefits: ['Separates database operations from the API host', 'Can reduce self-managed backup and maintenance work when the service includes those features'],
      limitations: ['Current provider features, pricing, regions, backups, and networking were not verified', 'Migration and backup procedures remain the application operator’s responsibility'],
      integrationComplexity: 'MEDIUM',
      alternatives: ['Self-managed PostgreSQL', 'A managed relational database service whose current PostgreSQL support is independently verified'],
      evidence: [...stack.manifestPaths, ...stack.configurationPaths.filter((filePath) => filePath.toLowerCase().endsWith('.prisma'))],
      compatibilityNotes: ['This recommendation is conditional on database evidence. Verify current provider capabilities and network access before selection; no database was contacted.'],
    });
  } else if (stack.databases.includes('Prisma ORM (provider not verified)')) {
    recommendations.push({
      id: 'database-provider-check',
      category: 'DATABASE',
      title: 'Verify the Prisma datasource before selecting a database platform',
      whyItFits: 'Prisma is present, but this snapshot does not provide a recognized datasource provider in the files analyzed.',
      benefits: ['Avoids choosing a database service based only on the ORM dependency'],
      limitations: ['No provider-specific hosting recommendation can be made from current evidence'],
      integrationComplexity: 'LOW',
      alternatives: ['Inspect the project’s Prisma datasource and deployment configuration'],
      evidence: stack.manifestPaths,
      compatibilityNotes: ['No database compatibility, pricing, or availability claims are made.'],
    });
  }

  if (hasVitest) {
    recommendations.push({
      id: 'vitest-existing-test-stack',
      category: 'TESTING',
      title: 'Continue using the detected Vitest test stack',
      whyItFits: 'Vitest is already declared in the project manifests, so reusing it avoids introducing a second test runner without a specific requirement.',
      benefits: ['Uses an existing dependency', 'Avoids unnecessary test-tool migration'],
      limitations: ['This does not establish that the current tests cover production behavior or live deployment'],
      integrationComplexity: 'LOW',
      alternatives: ['Add a different runner only for a documented capability gap'],
      evidence: stack.manifestPaths,
      compatibilityNotes: ['Recommendation is based on manifest evidence; no tests were run by this endpoint.'],
    });
  }

  return recommendations;
}

export function buildProjectRecommendations(
  projectId: string,
  snapshotId: string,
  files: AssistantSourceFile[],
  analysisStatus: 'COMPLETE' | 'PARTIAL',
): ProjectRecommendations {
  const stack = detectEvidence(files);
  const hasMalformedManifest = files.some((file) =>
    path.posix.basename(file.path).toLowerCase() === 'package.json' && parseManifest(file) === null);
  return {
    projectId,
    snapshotId,
    analysisStatus: analysisStatus === 'PARTIAL' || hasMalformedManifest ? 'PARTIAL' : 'COMPLETE',
    stack,
    recommendations: buildRecommendations(stack),
    pricingAndAvailability: 'NOT_VERIFIED',
  };
}
