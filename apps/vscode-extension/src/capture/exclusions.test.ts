import { describe, expect, it } from 'vitest';

import { createExclusionMatcher } from './exclusions';

describe('capture exclusions', () => {
  it('excludes common generated directories', () => {
    const matcher = createExclusionMatcher({
      customPatterns: [],
      excludeSensitiveFiles: true,
    });

    expect(matcher.shouldExcludePath('project/node_modules/react/index.js')).toBe(true);
    expect(matcher.shouldExcludePath('project/.octopus-storage/snapshots/a.zip')).toBe(true);
    expect(matcher.shouldExcludePath('project/.vite/deps/chunk.js')).toBe(true);
    expect(matcher.shouldExcludePath('project/out/extension.js')).toBe(true);
    expect(matcher.shouldExcludePath('project/src/app.ts')).toBe(false);
  });

  it('applies custom patterns', () => {
    const matcher = createExclusionMatcher({
      customPatterns: ['**/tmp/**'],
      excludeSensitiveFiles: false,
    });

    expect(matcher.shouldExcludePath('repo/tmp/a.txt')).toBe(true);
  });

  it('includes credential files by default and supports an explicit exclusion override', () => {
    const matcher = createExclusionMatcher({
      customPatterns: [],
    });

    expect(matcher.shouldExcludePath('workspace/.env')).toBe(false);
    expect(matcher.shouldExcludePath('workspace/.env.local')).toBe(false);
    expect(matcher.shouldExcludePath('workspace/certs/client.pem')).toBe(false);
    expect(matcher.shouldExcludePath('workspace/keys/private.key')).toBe(false);

    const explicitSensitiveExclusion = createExclusionMatcher({
      customPatterns: [],
      excludeSensitiveFiles: true,
    });
    expect(explicitSensitiveExclusion.shouldExcludePath('workspace/certs/client.pem')).toBe(true);
    expect(explicitSensitiveExclusion.shouldExcludePath('workspace/keys/private.key')).toBe(true);
    expect(matcher.shouldExcludePath('workspace/release.vsix')).toBe(true);
    expect(matcher.shouldExcludePath('workspace/PROJECT_SPECIFICATION.md.pdf')).toBe(true);
    expect(matcher.shouldExcludePath('workspace/debug.log')).toBe(true);
    expect(matcher.shouldExcludePath('workspace/config.ts')).toBe(false);
  });
});
