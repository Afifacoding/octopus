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
});