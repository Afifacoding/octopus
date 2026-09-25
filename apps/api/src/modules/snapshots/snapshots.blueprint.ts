import path from 'node:path';

import yauzl from 'yauzl';

import { HttpError } from '../../core/errors/http-error.js';
import { assertSafeRelativePath } from '../../core/security/secure-file-path.js';
import { canExposeThroughVault } from '../secrets/secrets.protection-policy.js';
import type { SnapshotDirectoryTree, SnapshotTreeNode } from './snapshots.types.js';

type BlueprintComputation = {
  projectType: string;
  detectedFrameworks: string[];
  detectedLanguages: string[];
  importantConfigFiles: string[];
  dependencyMetadata: Record<string, unknown> | null;
  entryPoints: string[];
  detectedCommands: string[];
  environmentReferences: string[];
  summary: string;
  metadata: Record<string, unknown>;
};

type AnalyzeBlueprintOptions = {
  archiveBuffer: Buffer;
  maxPathLength: number;
  directoryTree?: SnapshotDirectoryTree | null;
};

const MAX_FILE_READ_BYTES = 256 * 1024;
const MAX_TOTAL_READ_BYTES = 2 * 1024 * 1024;

const languageByExtension: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.java': 'Java',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.go': 'Go',
  '.rs': 'Rust',
  '.php': 'PHP',
};

const rootConfigNames = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'angular.json',
  'requirements.txt',
  'pyproject.toml',
  'pipfile',
  'poetry.lock',
  'pom.xml',
  'build.gradle',
  'cargo.toml',
  'go.mod',
  'composer.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'dockerfile',
  '.env.example',
  'schema.prisma',
]);

const entryPointCandidates = [
  'src/main.tsx',
  'src/index.tsx',
  'src/main.ts',
  'src/index.ts',
  'src/main.jsx',
  'src/index.jsx',
  'src/main.js',
  'src/index.js',
  'index.ts',
  'index.js',
  'server.ts',
  'server.js',
  'main.py',
  'app.py',
  'manage.py',
  'main.go',
  'src/main.rs',
  'main.rs',
];

function normalizeArchivePath(inputPath: string, maxPathLength: number) {
  if (inputPath.includes('\u0000')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry contains invalid characters');
  }

  if (/^[a-zA-Z]:/.test(inputPath) || inputPath.startsWith('/') || inputPath.startsWith('\\')) {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Absolute archive entry paths are not allowed');
  }

  const normalized = assertSafeRelativePath(path.posix.normalize(inputPath.replace(/\\/g, '/')));
  if (normalized === '.' || normalized === '') {
    throw new HttpError(400, 'SNAPSHOT_INVALID_ENTRY_PATH', 'Snapshot archive entry path is invalid');
  }

  if (normalized.length > maxPathLength) {
    throw new HttpError(400, 'SNAPSHOT_ENTRY_PATH_TOO_LONG', 'Snapshot entry path is too long');
  }

  return normalized;
}

function flattenTreeNodes(nodes: SnapshotTreeNode[], out: Set<string>) {
  for (const node of nodes) {
    if (node.type === 'FILE') {
      out.add(node.relativePath);
    }

    if (node.children.length > 0) {
      flattenTreeNodes(node.children, out);
    }
  }
}

function fileIsConfigIndicator(relativePath: string) {
  const lower = relativePath.toLowerCase();
  const fileName = path.posix.basename(lower);

  if (rootConfigNames.has(fileName)) {
    return true;
  }

  if (fileName.startsWith('vite.config.')) {
    return true;
  }

  if (fileName.startsWith('next.config.')) {
    return true;
  }

  return false;
}

function fileNeedsContent(relativePath: string) {
  const lower = relativePath.toLowerCase();
  const fileName = path.posix.basename(lower);

  return (
    fileName === 'package.json' ||
    fileName === 'requirements.txt' ||
    fileName === 'pyproject.toml' ||
    fileName === 'pipfile' ||
    fileName === 'pom.xml' ||
    fileName === 'build.gradle' ||
    fileName === 'cargo.toml' ||
    fileName === 'go.mod' ||
    fileName === 'composer.json' ||
    fileName === 'schema.prisma' ||
    fileName === 'docker-compose.yml' ||
    fileName === 'docker-compose.yaml' ||
    fileName === '.env' ||
    fileName.startsWith('.env.')
  );
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parsePackageDependencies(packageJson: Record<string, unknown>) {
  const dependencies = getObject(packageJson.dependencies) ?? {};
  const devDependencies = getObject(packageJson.devDependencies) ?? {};
  const peerDependencies = getObject(packageJson.peerDependencies) ?? {};
  const scripts = getObject(packageJson.scripts) ?? {};

  return {
    dependencies: Object.keys(dependencies),
    devDependencies: Object.keys(devDependencies),
    peerDependencies: Object.keys(peerDependencies),
    scripts: Object.keys(scripts),
    packageName: typeof packageJson.name === 'string' ? packageJson.name : null,
    packageVersion: typeof packageJson.version === 'string' ? packageJson.version : null,
    packageMain: typeof packageJson.main === 'string' ? packageJson.main : null,
    packageType: typeof packageJson.type === 'string' ? packageJson.type : null,
    scriptMap: Object.entries(scripts).reduce<Record<string, string>>((out, [key, value]) => {
      if (typeof value === 'string') {
        out[key] = value;
      }

      return out;
    }, {}),
  };
}

function parseRequirementsTxt(content: string) {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function parsePyProjectDependencies(content: string) {
  const rows = content.split(/\r?\n/u);
  const dependencies = new Set<string>();

  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const poetryMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*['"]?[^'"]+/u);
    if (poetryMatch && !line.startsWith('python') && !line.startsWith('name') && !line.startsWith('version')) {
      dependencies.add(poetryMatch[1]!.toLowerCase());
      continue;
    }

    const pep621Match = line.match(/^"([A-Za-z0-9_.-]+)(?:[<>=!~].*)?"\s*,?$/u);
    if (pep621Match) {
      dependencies.add(pep621Match[1]!.toLowerCase());
    }
  }

  return [...dependencies].sort((left, right) => left.localeCompare(right));
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map((chunk) => chunk[0]!.toUpperCase() + chunk.slice(1))
    .join(' ');
}

function detectLanguages(filePaths: Set<string>) {
  const detected = new Set<string>();

  for (const filePath of filePaths) {
    const extension = path.posix.extname(filePath.toLowerCase());
    const language = languageByExtension[extension];
    if (language) {
      detected.add(language);
    }
  }

  return [...detected].sort((left, right) => left.localeCompare(right));
}

function detectFrameworks(options: {
  filePaths: Set<string>;
  dependencyNames: Set<string>;
  requirementNames: Set<string>;
}) {
  const frameworks = new Set<string>();
  const evidence: Record<string, string[]> = {};

  const add = (framework: string, reason: string) => {
    frameworks.add(framework);
    const current = evidence[framework] ?? [];
    evidence[framework] = [...current, reason];
  };

  const hasFile = (needle: string) => [...options.filePaths].some((filePath) => filePath.toLowerCase().endsWith(needle));

  if (options.dependencyNames.has('react') || hasFile('src/main.tsx') || hasFile('src/index.tsx')) {
    add('React', 'react dependency or TSX entry point');
  }

  if (options.dependencyNames.has('vite') || [...options.filePaths].some((filePath) => path.posix.basename(filePath).toLowerCase().startsWith('vite.config.'))) {
    add('Vite', 'vite dependency or vite config file');
  }

  if (options.dependencyNames.has('next') || [...options.filePaths].some((filePath) => path.posix.basename(filePath).toLowerCase().startsWith('next.config.'))) {
    add('Next.js', 'next dependency or next config file');
  }

  if (options.dependencyNames.has('@angular/core') || hasFile('angular.json')) {
    add('Angular', 'angular dependency or angular.json');
  }

  if (options.dependencyNames.has('vue') || [...options.filePaths].some((filePath) => filePath.toLowerCase().endsWith('.vue'))) {
    add('Vue', 'vue dependency or .vue file');
  }

  if (options.dependencyNames.size > 0 || hasFile('package.json')) {
    add('Node.js', 'package.json/dependencies indicate node ecosystem');
  }

  if (options.dependencyNames.has('express')) {
    add('Express', 'express dependency');
  }

  if (options.dependencyNames.has('fastify')) {
    add('Fastify', 'fastify dependency');
  }

  if (options.dependencyNames.has('@nestjs/core') || options.dependencyNames.has('@nestjs/common')) {
    add('NestJS', 'nestjs dependencies');
  }

  const hasPythonFiles = [...options.filePaths].some((filePath) => filePath.toLowerCase().endsWith('.py'));
  if (hasPythonFiles || hasFile('requirements.txt') || hasFile('pyproject.toml')) {
    add('Python', 'python source or dependency metadata files');
  }

  if (options.requirementNames.has('django') || hasFile('manage.py')) {
    add('Django', 'django dependency or manage.py');
  }

  if (options.requirementNames.has('flask') || options.dependencyNames.has('flask')) {
    add('Flask', 'flask dependency marker');
  }

  return {
    frameworks: [...frameworks].sort((left, right) => left.localeCompare(right)),
    evidence,
  };
}

function detectProjectType(frameworks: string[]) {
  const frontend = new Set(['React', 'Vite', 'Next.js', 'Angular', 'Vue']);
  const backend = new Set(['Node.js', 'Express', 'Fastify', 'NestJS', 'Python', 'Django', 'Flask']);

  const hasFrontend = frameworks.some((framework) => frontend.has(framework));
  const hasBackend = frameworks.some((framework) => backend.has(framework));

  if (hasFrontend && hasBackend) {
    return 'FULLSTACK';
  }

  if (hasFrontend) {
    return 'FRONTEND';
  }

  if (hasBackend) {
    return 'BACKEND';
  }

  return 'UNKNOWN';
}

function detectEntryPoints(filePaths: Set<string>) {
  const lowerToOriginal = new Map<string, string>();
  for (const filePath of filePaths) {
    lowerToOriginal.set(filePath.toLowerCase(), filePath);
  }

  const matches: string[] = [];

  for (const candidate of entryPointCandidates) {
    const found = lowerToOriginal.get(candidate.toLowerCase());
    if (found) {
      matches.push(found);
    }
  }

  return matches;
}

function detectConfigFiles(filePaths: Set<string>) {
  return [...filePaths]
    .filter((filePath) => fileIsConfigIndicator(filePath))
    .sort((left, right) => left.localeCompare(right));
}

function detectEnvironmentReferences(filePaths: Set<string>) {
  return [...filePaths]
    .filter((filePath) => {
      const base = path.posix.basename(filePath).toLowerCase();
      return base === '.env' || base.startsWith('.env.') || base === '.env.example';
    })
    .sort((left, right) => left.localeCompare(right));
}

function detectImportantFolders(filePaths: Set<string>) {
  const folders = new Set<string>();
  for (const filePath of filePaths) {
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length > 1) {
      folders.add(parts[0]!);
    }
  }

  return [...folders].sort((left, right) => left.localeCompare(right));
}

function detectPackageManager(filePaths: Set<string>) {
  const has = (suffix: string) => [...filePaths].some((filePath) => filePath.toLowerCase().endsWith(suffix));

  if (has('pnpm-lock.yaml')) {
    return 'pnpm';
  }

  if (has('yarn.lock')) {
    return 'yarn';
  }

  if (has('package-lock.json')) {
    return 'npm';
  }

  if (has('poetry.lock')) {
    return 'poetry';
  }

  if (has('pipfile')) {
    return 'pipenv';
  }

  if (has('requirements.txt') || has('pyproject.toml')) {
    return 'pip';
  }

  if (has('package.json')) {
    return 'npm';
  }

  return null;
}

function inferApplicationType(frameworks: string[], filePaths: Set<string>) {
  const hasFrontend = frameworks.some((framework) => ['React', 'Vite', 'Next.js', 'Angular', 'Vue'].includes(framework));
  const hasBackend = frameworks.some((framework) => ['Express', 'Fastify', 'NestJS', 'Django', 'Flask'].includes(framework));
  const hasCliMain = [...filePaths].some((item) => /(^|\/)main\.(py|ts|js|go|rs)$/i.test(item));

  if (hasFrontend && hasBackend) {
    return 'Full-stack Application';
  }

  if (hasFrontend) {
    return 'Web Application';
  }

  if (hasBackend) {
    return 'Backend Service';
  }

  if (hasCliMain) {
    return 'CLI/Script Application';
  }

  return 'Application';
}

type EnvironmentRequirement = {
  name: string;
  status: 'Required' | 'Optional';
  sourceFiles: string[];
};

function extractEnvironmentRequirements(fileContents: Map<string, string>) {
  const byName = new Map<string, EnvironmentRequirement>();

  for (const [filePath, content] of fileContents.entries()) {
    const base = path.posix.basename(filePath).toLowerCase();
    if (!(base === '.env' || base.startsWith('.env.'))) {
      continue;
    }

    const lines = content.split(/\r?\n/u);
    const fromExample = base.includes('example');

    for (const row of lines) {
      const line = row.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
      const match = normalizedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/u);
      if (!match) {
        continue;
      }

      const key = match[1]!.toUpperCase();
      if (!canExposeThroughVault({ label: key })) {
        continue;
      }

      const existing = byName.get(key);
      const nextStatus: 'Required' | 'Optional' = fromExample ? 'Required' : 'Optional';

      if (!existing) {
        byName.set(key, {
          name: key,
          status: nextStatus,
          sourceFiles: [filePath],
        });
        continue;
      }

      byName.set(key, {
        name: key,
        status: existing.status === 'Required' || nextStatus === 'Required' ? 'Required' : 'Optional',
        sourceFiles: [...new Set([...existing.sourceFiles, filePath])],
      });
    }
  }

  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function inferDatabaseInfo(input: {
  dependencyNames: Set<string>;
  filePaths: Set<string>;
  fileContents: Map<string, string>;
  environmentRequirements: EnvironmentRequirement[];
}) {
  let technology: string | null = null;
  let orm: string | null = null;
  let schemaFile: string | null = null;
  let migrationDirectory: string | null = null;

  const hasFile = (suffix: string) => [...input.filePaths].some((item) => item.toLowerCase().endsWith(suffix));

  const schemaPath = [...input.filePaths].find((item) => item.toLowerCase().endsWith('schema.prisma')) ?? null;
  if (schemaPath) {
    orm = 'Prisma';
    schemaFile = schemaPath;
    migrationDirectory = schemaPath.includes('/')
      ? `${schemaPath.slice(0, schemaPath.lastIndexOf('/'))}/migrations`
      : 'migrations';

    const schemaContent = input.fileContents.get(schemaPath);
    if (schemaContent) {
      const providerMatch = schemaContent.match(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([a-z0-9+_-]+)"/iu);
      if (providerMatch) {
        technology = toTitleCase(providerMatch[1]!);
      }
    }
  }

  if (!technology) {
    if (input.dependencyNames.has('pg') || input.dependencyNames.has('postgres')) {
      technology = 'PostgreSQL';
    } else if (input.dependencyNames.has('mysql2') || input.dependencyNames.has('mysql')) {
      technology = 'MySQL';
    } else if (input.dependencyNames.has('mongodb') || input.dependencyNames.has('mongoose')) {
      technology = 'MongoDB';
    } else if (input.dependencyNames.has('redis') || input.environmentRequirements.some((item) => item.name === 'REDIS_URL')) {
      technology = 'Redis';
    } else if (input.dependencyNames.has('sqlite3') || input.dependencyNames.has('better-sqlite3')) {
      technology = 'SQLite';
    }
  }

  if (!orm) {
    if (input.dependencyNames.has('typeorm')) {
      orm = 'TypeORM';
    } else if (input.dependencyNames.has('sequelize')) {
      orm = 'Sequelize';
    } else if (input.dependencyNames.has('mongoose')) {
      orm = 'Mongoose';
    } else if (input.dependencyNames.has('django')) {
      orm = 'Django ORM';
    } else if (input.dependencyNames.has('sqlalchemy')) {
      orm = 'SQLAlchemy';
    }
  }

  const detected = Boolean(technology || orm || schemaFile);
  return {
    detected,
    technology,
    orm,
    schemaFile,
    migrationDirectory,
  };
}

function inferDeploymentInfo(filePaths: Set<string>) {
  const deploymentFiles = [...filePaths].filter((item) => {
    const lower = item.toLowerCase();
    const base = path.posix.basename(lower);
    return (
      base === 'dockerfile' ||
      base === 'docker-compose.yml' ||
      base === 'docker-compose.yaml' ||
      base === 'vercel.json' ||
      base === 'render.yaml' ||
      base === 'netlify.toml'
    );
  });

  return {
    containerizationDetected: deploymentFiles.some((item) => {
      const lower = path.posix.basename(item).toLowerCase();
      return lower === 'dockerfile' || lower === 'docker-compose.yml' || lower === 'docker-compose.yaml';
    }),
    deploymentFiles: deploymentFiles.sort((left, right) => left.localeCompare(right)),
  };
}

function buildArchitectureSummary(input: {
  stack: {
    frontend: string[];
    backend: string[];
    database: string[];
  };
}) {
  const hasFrontend = input.stack.frontend.length > 0;
  const hasBackend = input.stack.backend.length > 0;
  const hasDatabase = input.stack.database.length > 0;

  if (hasFrontend && hasBackend && hasDatabase) {
    return {
      summary: `${input.stack.frontend[0]} frontend communicates with ${input.stack.backend[0]} services backed by ${input.stack.database[0]}.`,
      flow: [input.stack.frontend[0], input.stack.backend[0], input.stack.database[0]],
      confidence: 'HIGH',
    } as const;
  }

  if (hasFrontend && hasBackend) {
    return {
      summary: `${input.stack.frontend[0]} application calling ${input.stack.backend[0]} API/service layer.`,
      flow: [input.stack.frontend[0], input.stack.backend[0]],
      confidence: 'MEDIUM',
    } as const;
  }

  if (hasBackend && hasDatabase) {
    return {
      summary: `${input.stack.backend[0]} service with ${input.stack.database[0]} data layer.`,
      flow: [input.stack.backend[0], input.stack.database[0]],
      confidence: 'MEDIUM',
    } as const;
  }

  return {
    summary: 'Architecture information could not be fully inferred from this snapshot.',
    flow: [] as string[],
    confidence: 'LOW',
  } as const;
}

function detectTopLevelDirectories(filePaths: Set<string>) {
  const directories = new Set<string>();

  for (const filePath of filePaths) {
    const firstSegment = filePath.split('/').filter(Boolean)[0];
    if (firstSegment) {
      directories.add(firstSegment);
    }
  }

  return [...directories].sort((left, right) => left.localeCompare(right));
}

async function collectZipInsights(options: AnalyzeBlueprintOptions) {
  const filePaths = new Set<string>();
  const fileContents = new Map<string, string>();
  let totalReadBytes = 0;

  if (options.directoryTree) {
    flattenTreeNodes(options.directoryTree.nodes, filePaths);
  }

  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      reject(error instanceof HttpError ? error : new HttpError(400, 'SNAPSHOT_ARCHIVE_INVALID', 'Invalid ZIP archive'));
    };

    yauzl.fromBuffer(options.archiveBuffer, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        fail(openError);
        return;
      }

      zipFile.on('error', (zipError) => {
        zipFile.close();
        fail(zipError);
      });

      zipFile.on('entry', (entry) => {
        let normalizedPath = '';

        try {
          normalizedPath = normalizeArchivePath(entry.fileName, options.maxPathLength);
        } catch (error) {
          zipFile.close();
          fail(error);
          return;
        }

        if (entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        filePaths.add(normalizedPath);

        if (!fileNeedsContent(normalizedPath) || entry.uncompressedSize > MAX_FILE_READ_BYTES) {
          zipFile.readEntry();
          return;
        }

        if (totalReadBytes + entry.uncompressedSize > MAX_TOTAL_READ_BYTES) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            zipFile.close();
            fail(streamError);
            return;
          }

          const chunks: Buffer[] = [];
          let streamBytes = 0;

          readStream.on('data', (chunk: Buffer) => {
            streamBytes += chunk.byteLength;

            if (streamBytes > MAX_FILE_READ_BYTES) {
              readStream.destroy(new Error('metadata file exceeds read limit'));
              return;
            }

            chunks.push(chunk);
          });

          readStream.on('error', (streamReadError) => {
            zipFile.close();
            fail(streamReadError);
          });

          readStream.on('end', () => {
            totalReadBytes += streamBytes;
            fileContents.set(normalizedPath, Buffer.concat(chunks).toString('utf8'));
            zipFile.readEntry();
          });
        });
      });

      zipFile.on('end', () => {
        resolve();
      });

      zipFile.readEntry();
    });
  });

  return {
    filePaths,
    fileContents,
  };
}

export async function analyzeBlueprintFromSnapshot(options: AnalyzeBlueprintOptions): Promise<BlueprintComputation> {
  const insights = await collectZipInsights(options);

  const languages = detectLanguages(insights.filePaths);
  const importantConfigFiles = detectConfigFiles(insights.filePaths);
  const environmentReferences = detectEnvironmentReferences(insights.filePaths);
  const environmentRequirements = extractEnvironmentRequirements(insights.fileContents);

  const packageJsonRaw = [...insights.fileContents.entries()].find(
    ([filePath]) => path.posix.basename(filePath).toLowerCase() === 'package.json',
  );
  const packageJson = packageJsonRaw ? parseJson(packageJsonRaw[1]) : null;

  const parsedPackage = packageJson ? parsePackageDependencies(packageJson) : null;

  const requirementsRaw = [...insights.fileContents.entries()].find(
    ([filePath]) => path.posix.basename(filePath).toLowerCase() === 'requirements.txt',
  );

  const pyProjectRaw = [...insights.fileContents.entries()].find(
    ([filePath]) => path.posix.basename(filePath).toLowerCase() === 'pyproject.toml',
  );
  const pyProjectDependencies = pyProjectRaw ? parsePyProjectDependencies(pyProjectRaw[1]) : [];

  const requirementNames = new Set<string>();
  if (requirementsRaw) {
    for (const requirement of parseRequirementsTxt(requirementsRaw[1])) {
      const name = requirement.split(/[=<>!~]/u)[0]?.trim().toLowerCase();
      if (name) {
        requirementNames.add(name);
      }
    }
  }

  if (pyProjectRaw) {
    for (const dependency of pyProjectDependencies) {
      requirementNames.add(dependency.toLowerCase());
    }
  }

  const dependencyNames = new Set<string>();
  if (parsedPackage) {
    for (const dependencyName of [
      ...parsedPackage.dependencies,
      ...parsedPackage.devDependencies,
      ...parsedPackage.peerDependencies,
    ]) {
      dependencyNames.add(dependencyName.toLowerCase());
    }
  }

  const frameworkDetection = detectFrameworks({
    filePaths: insights.filePaths,
    dependencyNames,
    requirementNames,
  });

  const detectedCommands = new Set<string>();
  if (parsedPackage) {
    for (const scriptName of Object.keys(parsedPackage.scriptMap)) {
      if (['dev', 'start', 'build', 'test', 'lint', 'preview'].includes(scriptName)) {
        detectedCommands.add(`npm run ${scriptName}`);
      }
    }

    detectedCommands.add('npm install');
  }

  if (frameworkDetection.frameworks.includes('Django')) {
    detectedCommands.add('python manage.py runserver');
  }

  if (frameworkDetection.frameworks.includes('Flask')) {
    detectedCommands.add('flask run');
  }

  if ([...insights.filePaths].some((filePath) => path.posix.basename(filePath).toLowerCase() === 'go.mod')) {
    detectedCommands.add('go run .');
  }

  if ([...insights.filePaths].some((filePath) => path.posix.basename(filePath).toLowerCase() === 'cargo.toml')) {
    detectedCommands.add('cargo run');
  }

  if (requirementNames.size > 0) {
    detectedCommands.add('pip install -r requirements.txt');
  }

  const packageManager = detectPackageManager(insights.filePaths);

  const stack = {
    frontend: frameworkDetection.frameworks.filter((item) => ['React', 'Vite', 'Next.js', 'Angular', 'Vue'].includes(item)),
    backend: frameworkDetection.frameworks.filter((item) => ['Node.js', 'Express', 'Fastify', 'NestJS', 'Python', 'Django', 'Flask'].includes(item)),
    database: [] as string[],
    tooling: frameworkDetection.frameworks.filter((item) => !['React', 'Vite', 'Next.js', 'Angular', 'Vue', 'Node.js', 'Express', 'Fastify', 'NestJS', 'Python', 'Django', 'Flask'].includes(item)),
  };

  const dependencyMetadata: Record<string, unknown> = {};

  if (parsedPackage) {
    dependencyMetadata.packageJson = {
      packageName: parsedPackage.packageName,
      packageVersion: parsedPackage.packageVersion,
      packageMain: parsedPackage.packageMain,
      packageType: parsedPackage.packageType,
      dependencyCount: parsedPackage.dependencies.length,
      devDependencyCount: parsedPackage.devDependencies.length,
      peerDependencyCount: parsedPackage.peerDependencies.length,
      scripts: parsedPackage.scriptMap,
      dependencies: parsedPackage.dependencies,
      devDependencies: parsedPackage.devDependencies,
      peerDependencies: parsedPackage.peerDependencies,
      source: 'package.json',
    };
  }

  if (requirementsRaw) {
    dependencyMetadata.requirements = {
      dependencyCount: requirementNames.size,
      dependencies: [...requirementNames].sort((left, right) => left.localeCompare(right)),
      source: 'requirements.txt',
    };
  }

  if (pyProjectRaw) {
    dependencyMetadata.pyproject = {
      dependencyCount: pyProjectDependencies.length,
      dependencies: pyProjectDependencies,
      source: 'pyproject.toml',
    };
  }

  const databaseInfo = inferDatabaseInfo({
    dependencyNames,
    filePaths: insights.filePaths,
    fileContents: insights.fileContents,
    environmentRequirements,
  });

  if (databaseInfo.technology) {
    stack.database.push(databaseInfo.technology);
  }

  const deploymentInfo = inferDeploymentInfo(insights.filePaths);

  const architecture = buildArchitectureSummary({
    stack: {
      frontend: stack.frontend,
      backend: stack.backend,
      database: stack.database,
    },
  });

  const topLevelDirectories = detectTopLevelDirectories(insights.filePaths);
  const importantFolders = detectImportantFolders(insights.filePaths);

  const configurationFiles = importantConfigFiles.map((configPath) => {
    const base = path.posix.basename(configPath).toLowerCase();
    let purpose = 'Configuration';

    if (base === 'package.json') {
      purpose = 'JavaScript dependencies and scripts';
    } else if (base.startsWith('tsconfig')) {
      purpose = 'TypeScript compiler configuration';
    } else if (base.startsWith('vite.config.')) {
      purpose = 'Vite bundler configuration';
    } else if (base === 'dockerfile') {
      purpose = 'Container image build instructions';
    } else if (base === 'docker-compose.yml' || base === 'docker-compose.yaml') {
      purpose = 'Container service orchestration';
    } else if (base === 'requirements.txt') {
      purpose = 'Python dependencies';
    } else if (base === 'pyproject.toml') {
      purpose = 'Python project metadata and dependencies';
    } else if (base === 'schema.prisma') {
      purpose = 'Database schema and ORM mappings';
    } else if (base === '.env.example') {
      purpose = 'Environment variable template';
    }

    return {
      path: configPath,
      purpose,
    };
  });

  const entryPoints = [...new Set([
    ...detectEntryPoints(insights.filePaths),
    ...(parsedPackage?.packageMain ? [parsedPackage.packageMain] : []),
    ...deploymentInfo.deploymentFiles.filter((item) => path.posix.basename(item).toLowerCase() === 'dockerfile'),
  ])].sort((left, right) => left.localeCompare(right));

  const dependencyMetadataValue = Object.keys(dependencyMetadata).length > 0 ? dependencyMetadata : null;

  const projectType = detectProjectType(frameworkDetection.frameworks);

  const primaryLanguage = languages[0] ?? null;
  const primaryFramework = frameworkDetection.frameworks.find((item) => item !== 'Node.js' && item !== 'Python') ?? frameworkDetection.frameworks[0] ?? null;
  const runtime = frameworkDetection.frameworks.includes('Python') ? 'Python' : frameworkDetection.frameworks.includes('Node.js') ? 'Node.js' : null;
  const projectName = parsedPackage?.packageName ?? null;
  const applicationType = inferApplicationType(frameworkDetection.frameworks, insights.filePaths);

  const completeness = {
    projectStructure: topLevelDirectories.length > 0,
    technologyStack: frameworkDetection.frameworks.length > 0,
    dependencies: dependencyMetadataValue !== null,
    entryPoints: entryPoints.length > 0,
    environmentVariables: environmentRequirements.length > 0,
    runInstructions: detectedCommands.size > 0,
    databaseConfiguration: databaseInfo.detected,
    deploymentConfiguration: deploymentInfo.deploymentFiles.length > 0,
  };

  const metadata = {
    projectIdentity: {
      projectName,
      projectType,
      primaryLanguage,
      framework: primaryFramework,
      runtime,
      packageManager,
      applicationType,
    },
    technologyStack: stack,
    evidence: frameworkDetection.evidence,
    structure: {
      topLevelDirectories,
      importantFolders,
      totalFiles: insights.filePaths.size,
    },
    architecture,
    environment: {
      variables: environmentRequirements,
      references: environmentReferences,
    },
    configurationFiles,
    database: databaseInfo,
    deployment: deploymentInfo,
    completeness,
    processedStaticOnly: true,
  };

  const summaryParts = [
    `Detected ${frameworkDetection.frameworks.length} framework indicators`,
    `languages: ${languages.length > 0 ? languages.join(', ') : 'none'}`,
    `config files: ${importantConfigFiles.length}`,
    architecture.confidence === 'LOW' ? 'architecture: partial' : `architecture: ${architecture.summary}`,
  ];

  return {
    projectType,
    detectedFrameworks: frameworkDetection.frameworks,
    detectedLanguages: languages,
    importantConfigFiles,
    dependencyMetadata: dependencyMetadataValue,
    entryPoints,
    detectedCommands: [...detectedCommands].sort((left, right) => left.localeCompare(right)),
    environmentReferences,
    summary: summaryParts.join(' | '),
    metadata,
  };
}
