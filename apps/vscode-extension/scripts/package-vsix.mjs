import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const extensionRoot = resolve(process.cwd());
const stagingDir = mkdtempSync(join(tmpdir(), 'octopus-vsix-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      npm_config_workspaces: 'false'
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function pruneNonRuntimeArtifacts(rootDir) {
  const testFilePattern = /(^|\\|\/)out([\\/].*)?\.test\.js(\.map)?$/i;
  const testFolderPattern = /(^|\\|\/)out[\\/]test([\\/]|$)/i;

  function visit(currentPath) {
    const entry = statSync(currentPath);
    if (entry.isDirectory()) {
      if (testFolderPattern.test(currentPath)) {
        rmSync(currentPath, { recursive: true, force: true });
        return;
      }

      for (const child of readdirSync(currentPath)) {
        visit(join(currentPath, child));
      }
      return;
    }

    if (testFilePattern.test(currentPath)) {
      unlinkSync(currentPath);
    }
  }

  visit(rootDir);
}

function copyRequiredFile(relativePath) {
  const sourcePath = join(extensionRoot, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Required file not found: ${relativePath}`);
  }

  cpSync(sourcePath, join(stagingDir, relativePath), { recursive: true });
}

function createStagingPackageJson() {
  const packageJsonPath = join(extensionRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  const stagingPackageJson = {
    ...packageJson,
    scripts: undefined,
    devDependencies: undefined
  };

  writeFileSync(
    join(stagingDir, 'package.json'),
    `${JSON.stringify(stagingPackageJson, null, 2)}\n`,
    'utf8'
  );
}

function createStagingVscodeIgnore() {
  const ignoreRules = [
    'node_modules/**/test/**',
    'node_modules/**/tests/**',
    'node_modules/**/.github/**',
    'node_modules/**/*.map',
    'out/**/*.map',
    'out/**/*.test.js',
    'out/**/*.test.js.map',
    'out/test/**',
    'package-lock.json'
  ];

  writeFileSync(join(stagingDir, '.vscodeignore'), `${ignoreRules.join('\n')}\n`, 'utf8');
}

function main() {
  if (!existsSync(join(extensionRoot, 'out'))) {
    throw new Error('Build output missing. Run npm run build before packaging.');
  }

  createStagingPackageJson();
  createStagingVscodeIgnore();
  copyRequiredFile('README.md');
  copyRequiredFile('LICENSE.md');
  copyRequiredFile('resources');
  copyRequiredFile('out');
  pruneNonRuntimeArtifacts(join(stagingDir, 'out'));

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  run(npmCommand, ['install', '--omit=dev', '--workspaces=false'], stagingDir);
  run(npxCommand, ['--yes', '@vscode/vsce', 'package'], stagingDir);

  const vsixFileName = readdirSync(stagingDir).find((entry) => entry.endsWith('.vsix'));
  if (!vsixFileName) {
    throw new Error('VSIX packaging finished but no .vsix artifact was found.');
  }

  const vsixSource = join(stagingDir, vsixFileName);
  const vsixTarget = join(extensionRoot, vsixFileName);
  cpSync(vsixSource, vsixTarget);

  rmSync(stagingDir, { recursive: true, force: true });

  console.log(`VSIX ready: ${vsixTarget}`);
}

main();
