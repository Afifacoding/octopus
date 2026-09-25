const DEFAULT_EXCLUSION_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.vite/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.cache/**',
  '**/.tmp/**',
  '**/.octopus-storage/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.log',
  '**/*.tmp',
  '**/*.swp',
  '**/*.swo',
  '**/*.vsix',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.pdf',
];

const SENSITIVE_PATTERNS = [
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa',
  '**/id_ed25519',
  '**/.npmrc',
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern: string) {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  let regex = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];

    if (current === '*' && next === '*') {
      regex += '.*';
      index += 1;
      continue;
    }

    if (current === '*') {
      regex += '[^/]*';
      continue;
    }

    if (current === '?') {
      regex += '.';
      continue;
    }

    regex += escapeRegex(current ?? '');
  }

  regex += '$';
  return new RegExp(regex, 'i');
}

export type ExclusionMatcher = {
  shouldExcludePath: (relativePath: string) => boolean;
  activePatterns: string[];
};

export function createExclusionMatcher(options: {
  customPatterns?: string[];
  excludeSensitiveFiles?: boolean;
}): ExclusionMatcher {
  const customPatterns = (options.customPatterns ?? []).map((item) => item.trim()).filter(Boolean);

  const activePatterns = [
    ...DEFAULT_EXCLUSION_PATTERNS,
    ...customPatterns,
    ...(options.excludeSensitiveFiles ?? true ? SENSITIVE_PATTERNS : []),
  ];

  const matchers = activePatterns.map(globToRegex);

  return {
    shouldExcludePath(relativePath: string) {
      const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      return matchers.some((matcher) => matcher.test(normalized));
    },
    activePatterns,
  };
}

export function getDefaultExclusionPatterns() {
  return [...DEFAULT_EXCLUSION_PATTERNS];
}
