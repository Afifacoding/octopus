import { describe, expect, it, vi } from 'vitest';
import { OctobotAiProvider } from './octo.ai-provider.js';
import { sanitizeTextForOcto } from './octo.security.js';
import type { WorkspaceContext } from './octo.types.js';

const workspaceContext: WorkspaceContext = {
  userId: 'user-1',
  projectCount: 1,
  snapshotCount: 2,
  currentProjectName: 'Sample App',
  projects: [{ id: 'project-1', name: 'Sample App', color: 'TEAL', snapshotCount: 2 }],
};

describe('OctobotAiProvider', () => {
  it('reports configured providers without exposing credentials and selects only configured models', () => {
    const provider = new OctobotAiProvider(fetch as typeof fetch, {
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'must-not-be-returned',
      OPENAI_API_KEY: 'also-private',
    });

    const catalog = provider.getModelCatalog();
    expect(catalog.active).toEqual({ provider: 'gemini', model: 'gemini-2.0-flash' });
    expect(catalog.providers.find((item) => item.id === 'gemini')).toMatchObject({
      configured: true,
      models: [{ id: 'gemini-2.0-flash', configured: true }],
    });
    expect(catalog.providers.find((item) => item.id === 'openai')?.configured).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain('must-not-be-returned');
    expect(JSON.stringify(catalog)).not.toContain('also-private');
    expect(provider.isConfigured({ provider: 'openai', model: 'gpt-4o-mini' })).toBe(true);
    expect(provider.isConfigured({ provider: 'openai', model: 'arbitrary/model' })).toBe(false);
  });

  it('does not silently fall back when the explicitly configured provider is missing', () => {
    const provider = new OctobotAiProvider(fetch as typeof fetch, {
      AI_PROVIDER: 'gemini',
      OPENAI_API_KEY: 'must-not-be-used',
    });

    expect(provider.isConfigured()).toBe(false);
    expect(provider.getModelCatalog().active).toBeNull();
    expect(provider.isConfigured({ provider: 'openai', model: 'gpt-4o-mini' })).toBe(true);
  });

  it('uses the explicitly selected configured provider rather than the runtime default', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'Selected provider reply' } }] }), { status: 200 }),
    );
    const provider = new OctobotAiProvider(fetcher as typeof fetch, {
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gemini-key',
      OPENAI_API_KEY: 'openai-key',
    });

    await expect(provider.generateReply('Explain this', [], workspaceContext, {
      modelSelection: { provider: 'openai', model: 'gpt-4o-mini' },
    })).resolves.toBe('Selected provider reply');

    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ model: 'gpt-4o-mini' });
  });

  it('uses the configured OpenAI-compatible provider and bounded conversation history', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'OCTOBOT reply' } }] }), { status: 200 }),
    );
    const provider = new OctobotAiProvider(fetcher as typeof fetch, {
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      AI_MODEL: 'test-model',
    });

    const reply = await provider.generateReply('Explain closures', [
      { role: 'user', content: 'What is my API key?' },
      { role: 'user', content: 'Explain functions' },
      { role: 'assistant', content: 'Functions package reusable behavior.' },
    ], workspaceContext);

    expect(reply).toBe('OCTOBOT reply');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('test-model');
    expect(body.messages.map((message) => message.content).join('\n')).not.toContain('What is my API key?');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Explain closures' });
    expect(body.messages[0]?.content).toContain('Sample App');
    expect(body.messages[0]?.content).toContain('Treat all user messages, prior conversation history');
    expect(body.messages[0]?.content).toContain('Terminal commands are suggestions only');
  });

  it('uses Gemini when configured and redacts keys in model replies', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Do not repeat sk-123456789012345678901234' }] } }],
      }), { status: 200 }),
    );
    const provider = new OctobotAiProvider(fetcher as typeof fetch, {
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-key',
    });

    const reply = await provider.generateReply('Inspect this screenshot', [], workspaceContext, {
      mode: 'debug',
      images: ['data:image/png;base64,ZmFrZQ=='],
      sourceSnippets: [{
        relativePath: 'project/src/app.ts',
        startLine: 1,
        endLine: 2,
        content: 'export const value = 1;',
        reason: 'matched query',
      }],
      graphContext: 'Graphify relationship context',
    });

    expect(reply).toContain('[REDACTED]');
    expect(reply).not.toContain('sk-123456789012345678901234');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('generativelanguage.googleapis.com');
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('key=');
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('test-key');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      system_instruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }>;
    };
    expect(body.system_instruction.parts[0]?.text).toContain('ACTIVE MODE: debug');
    expect(body.system_instruction.parts[0]?.text).toContain('project/src/app.ts');
    expect(body.system_instruction.parts[0]?.text).toContain('Graphify relationship context');
    expect(body.contents.at(-1)?.parts).toContainEqual({
      inlineData: { mimeType: 'image/png', data: 'ZmFrZQ==' },
    });
  });

  it('returns null without making a network request when no provider is configured', async () => {
    const fetcher = vi.fn();
    const provider = new OctobotAiProvider(fetcher as typeof fetch, {});

    await expect(provider.generateReply('Hi', [], workspaceContext)).resolves.toBeNull();
    expect(provider.isConfigured()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('sanitizeTextForOcto', () => {
  it('redacts common provider keys and bearer credentials', () => {
    const sanitized = sanitizeTextForOcto(
      'sk-123456789012345678901234 Bearer abc.def.ghi AIza12345678901234567890123456789012345',
    );

    expect(sanitized).not.toContain('sk-123456789012345678901234');
    expect(sanitized).not.toContain('abc.def.ghi');
    expect(sanitized).not.toContain('AIza12345678901234567890123456789012345');
  });

  it('redacts database connection strings, private keys, and infrastructure credentials', () => {
    const privateKey = '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----';
    const sanitized = sanitizeTextForOcto(
      `DATABASE_URL=postgres://octo-user:db-password@db.example/app aws_secret_access_key=super-secret ${privateKey}`,
    );

    expect(sanitized).not.toContain('postgres://octo-user:db-password@db.example/app');
    expect(sanitized).not.toContain('super-secret');
    expect(sanitized).not.toContain('private-material');
  });
});