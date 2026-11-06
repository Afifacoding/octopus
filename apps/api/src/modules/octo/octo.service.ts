/**
 * Octo Service
 * Orchestrates Octo intelligence: intent matching, security checks, context building, response generation
 */

import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import { randomUUID } from 'node:crypto';
import { createSnapshotFileDiff } from '../snapshots/snapshots.download.js';
import { OctoContextBuilder } from './octo.context.js';
import { matchIntent } from './octo.intents.js';
import { checkSecurityBoundary, isBlockedSensitiveRequest } from './octo.security.js';
import { OctobotAiProvider } from './octo.ai-provider.js';
import type { OctoRequest, OctoResponse, OctoSummary, OctoWorkspaceStats, WorkspaceContext } from './octo.types.js';
import {
  buildWorkspaceStats,
  detectIntelligenceQuery,
  OctoIntelligenceService,
  type IntelligenceQuery,
} from './octo.intelligence.js';
import { OctoProjectIntelligence } from './octo.project-intelligence.js';
import type { SnapshotsService } from '../snapshots/snapshots.service.js';
import { HttpError } from '../../core/errors/http-error.js';

type PendingPatch = {
  ownerId: string;
  projectId: string;
  snapshotId: string;
  filePath: string;
  summary: string;
  originalContent: string;
  proposedContent: string;
};

export class OctoService {
  private contextBuilder: OctoContextBuilder;
  private readonly intelligence: OctoIntelligenceService;
  private readonly intelligenceCache = new Map<string, OctoProjectIntelligence>();
  private readonly pendingPatches = new Map<string, PendingPatch>();

  constructor(
    private projectsRepository: ProjectsRepository,
    private snapshotsRepository: SnapshotsRepository,
    private readonly aiProvider: OctobotAiProvider = new OctobotAiProvider(),
    private readonly snapshotsService?: Pick<
      SnapshotsService,
      'getSnapshotSourceFiles' | 'getSnapshotFileContent' | 'createPatchedSnapshot'
    > & Partial<Pick<SnapshotsService, 'listSnapshots' | 'compareSnapshots'>>,
  ) {
    this.contextBuilder = new OctoContextBuilder(projectsRepository, snapshotsRepository);
    this.intelligence = new OctoIntelligenceService(snapshotsRepository, snapshotsService);
  }

  async ask(request: OctoRequest): Promise<OctoResponse> {
    // 1. Match intent from question
    const intentMatch = matchIntent(request.question);

    // 2. Check security boundary
    const securityCheck = checkSecurityBoundary(request.question, intentMatch);
    if (securityCheck.isBlocked) {
      return this.createBlockedResponse(securityCheck.message || 'I cannot provide that information.');
    }

    // 3. Build workspace context
    const context = await this.contextBuilder.buildContext(request.userId, request.projectId);

    // 4. Deterministic project & snapshot intelligence
    const intelligenceQuery: IntelligenceQuery | null = request.compare
      ? {
          kind: 'COMPARE',
          base: { type: 'id', value: request.compare.baseSnapshotId },
          target: { type: 'id', value: request.compare.targetSnapshotId },
        }
      : request.images?.length
        ? null
        : detectIntelligenceQuery(request.question);
    if (intelligenceQuery) {
      const answer = await this.intelligence.answer(intelligenceQuery, {
        userId: request.userId,
        question: request.question,
        context,
        projectId: request.projectId,
      });
      return {
        // Keep fact-bearing intelligence deterministic; a free-form AI rewrite
        // cannot be reliably checked for altered names, IDs, dates, or statuses.
        reply: answer.reply,
        intent: intentMatch.intent,
        suggestions: this.generateSuggestions(intentMatch.intent, context),
        summary: this.buildSummary(context),
        ...(answer.payload ? { intelligence: answer.payload } : {}),
      };
    }

    let sourceSnippets: ReturnType<OctoProjectIntelligence['retrieveContext']> = [];
    let graphContext = '';
    let intelligence: OctoProjectIntelligence | null = null;
    if (this.aiProvider.isConfigured() && request.projectId && request.snapshotId) {
      intelligence = await this.getProjectIntelligence(request.userId, request.projectId, request.snapshotId);
      sourceSnippets = intelligence.retrieveContext(request.question);
      graphContext = intelligence.getGraphContext(request.question);
    }

    let patchSource = this.shouldProposePatch(request) ? intelligence?.getPatchSource(request.question) || null : null;
    if (patchSource && request.projectId && request.snapshotId && this.snapshotsService) {
      try {
        const preview = await this.snapshotsService.getSnapshotFileContent(
          request.userId,
          request.projectId,
          request.snapshotId,
          patchSource.path,
        );
        if (
          !preview.file.supported ||
          preview.file.redactionApplied ||
          preview.file.truncated ||
          preview.file.content !== patchSource.content
        ) {
          patchSource = null;
        }
      } catch {
        patchSource = null;
      }
    }

    // 5. Generate natural language response
    let reply: string;
    let patchProposal: OctoResponse['patchProposal'];
    if (this.aiProvider.isConfigured()) {
      const history = (request.history || [])
        .filter((message) => message.role !== 'user' || !isBlockedSensitiveRequest(message.content))
        .slice(-10);
      try {
        const aiReply = await this.aiProvider.generateReply(request.question, history, context, {
          ...(request.mode ? { mode: request.mode } : {}),
          ...(sourceSnippets.length > 0 ? { sourceSnippets } : {}),
          ...(graphContext ? { graphContext } : {}),
          ...(request.images?.length ? { images: request.images } : {}),
          ...(patchSource ? { patchSource, patchRequested: true } : {}),
        });
        reply = aiReply || 'OCTOBOT returned an empty response. Please try again.';
        if (aiReply && patchSource && request.projectId && request.snapshotId) {
          const parsed = this.parsePatchProposal(aiReply, request, patchSource);
          reply = parsed.reply;
          patchProposal = parsed.patchProposal;
        }
      } catch {
        reply = 'OCTOBOT could not reach its configured AI provider. Please try again shortly.';
      }
    } else {
      reply = 'OCTOBOT needs a configured AI provider. Set AI_PROVIDER and its matching API key in the API environment to start a conversation.';
    }

    // 6. Generate suggestions for next questions
    const suggestions = this.generateSuggestions(intentMatch.intent, context);

    // 7. Build summary
    const summary = this.buildSummary(context);

    return {
      reply,
      intent: intentMatch.intent,
      suggestions,
      summary,
      ...(patchProposal ? { patchProposal } : {}),
    };
  }

  async getSummary(userId: string, projectId?: string): Promise<OctoSummary> {
    const context = await this.contextBuilder.buildContext(userId, projectId);
    return this.buildSummary(context);
  }

  async getWorkspaceIntelligence(userId: string): Promise<OctoWorkspaceStats> {
    const context = await this.contextBuilder.buildContext(userId);
    return buildWorkspaceStats(context);
  }

  async listProjectSnapshots(userId: string, projectId: string) {
    return this.intelligence.listProjectSnapshots(userId, projectId);
  }

  async getSnapshotDetails(userId: string, projectId: string, snapshotId: string) {
    return this.intelligence.getSnapshotDetails(userId, projectId, snapshotId);
  }

  async compareSnapshots(userId: string, projectId: string, baseSnapshotId: string, targetSnapshotId: string) {
    return this.intelligence.compareSnapshots(userId, projectId, baseSnapshotId, targetSnapshotId);
  }

  async getProjectGraph(userId: string, projectId: string, snapshotId: string) {
    const intelligence = await this.getProjectIntelligence(userId, projectId, snapshotId);
    return intelligence.buildGraph();
  }

  async approvePatch(userId: string, patchId: string) {
    const patch = this.pendingPatches.get(patchId);
    if (!patch || patch.ownerId !== userId) {
      throw new HttpError(404, 'OCTOBOT_PATCH_NOT_FOUND', 'Patch proposal not found');
    }
    if (!this.snapshotsService) {
      throw new HttpError(503, 'OCTOBOT_PATCH_UNAVAILABLE', 'Snapshot patching is unavailable');
    }

    const snapshot = await this.snapshotsService.createPatchedSnapshot(
      userId,
      patch.projectId,
      patch.snapshotId,
      patch.filePath,
      patch.originalContent,
      patch.proposedContent,
    );
    this.pendingPatches.delete(patchId);
    return snapshot;
  }

  rejectPatch(userId: string, patchId: string) {
    const patch = this.pendingPatches.get(patchId);
    if (!patch || patch.ownerId !== userId) {
      throw new HttpError(404, 'OCTOBOT_PATCH_NOT_FOUND', 'Patch proposal not found');
    }
    this.pendingPatches.delete(patchId);
    return { patchId, status: 'rejected' as const };
  }

  private shouldProposePatch(request: OctoRequest) {
    return request.mode === 'project-assistant' &&
      /\b(?:patch|fix|edit|modify|change|implement)\b/i.test(request.question);
  }

  private parsePatchProposal(
    reply: string,
    request: OctoRequest,
    source: { path: string; content: string },
  ): { reply: string; patchProposal?: NonNullable<OctoResponse['patchProposal']> } {
    const match = reply.match(/```octobot-patch\s*\r?\n([\s\S]*?)```/i);
    if (!match?.[1] || !request.projectId || !request.snapshotId) return { reply };

    const explanation = reply.replace(match[0], '').trim();
    try {
      const value = JSON.parse(match[1]) as Record<string, unknown>;
      if (
        value.filePath !== source.path ||
        typeof value.summary !== 'string' ||
        typeof value.proposedContent !== 'string' ||
        value.proposedContent.length === 0 ||
        value.proposedContent.length > 32_000
      ) {
        throw new Error('Invalid patch proposal');
      }

      const patchId = randomUUID();
      const summary = value.summary.slice(0, 300);
      const unifiedDiff = createSnapshotFileDiff(source.path, source.content, value.proposedContent);
      const additions = unifiedDiff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
      const deletions = unifiedDiff.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).length;

      this.pendingPatches.set(patchId, {
        ownerId: request.userId,
        projectId: request.projectId,
        snapshotId: request.snapshotId,
        filePath: source.path,
        summary,
        originalContent: source.content,
        proposedContent: value.proposedContent,
      });
      if (this.pendingPatches.size > 20) {
        const oldestId = this.pendingPatches.keys().next().value;
        if (oldestId) this.pendingPatches.delete(oldestId);
      }

      return {
        reply: explanation || 'OCTOBOT prepared a patch proposal for review.',
        patchProposal: { patchId, filePath: source.path, summary, diff: unifiedDiff, additions, deletions },
      };
    } catch {
      return { reply: `${explanation}\n\nOCTOBOT could not validate the proposed patch. No snapshot was changed.`.trim() };
    }
  }

  private async getProjectIntelligence(userId: string, projectId: string, snapshotId: string) {
    if (!this.snapshotsService) {
      throw new HttpError(503, 'OCTOBOT_INDEXING_UNAVAILABLE', 'Snapshot indexing is unavailable');
    }

    const cacheKey = `${userId}:${projectId}:${snapshotId}`;
    const cached = this.intelligenceCache.get(cacheKey);
    if (cached) return cached;

    const snapshotSource = await this.snapshotsService.getSnapshotSourceFiles(userId, projectId, snapshotId);
    const intelligence = new OctoProjectIntelligence(projectId, snapshotId, snapshotSource.files);
    this.intelligenceCache.set(cacheKey, intelligence);
    if (this.intelligenceCache.size > 8) {
      const oldestKey = this.intelligenceCache.keys().next().value;
      if (oldestKey) this.intelligenceCache.delete(oldestKey);
    }

    return intelligence;
  }

  private buildSummary(context: WorkspaceContext): OctoSummary {
    const greeting = this.generateGreeting(context.currentProjectName);

    const suggestions = this.generateDefaultSuggestions(context);

    return {
      greeting,
      projectCount: context.projectCount,
      snapshotCount: context.snapshotCount,
      assistantMode: this.aiProvider.isConfigured() ? 'live' : 'offline',
      projects: context.projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        snapshotCount: project.snapshotCount,
        failedSnapshotCount: project.failedSnapshotCount ?? 0,
        inProgressSnapshotCount: project.inProgressSnapshotCount ?? 0,
        latestSnapshotAt: project.latestSnapshotAt ?? null,
        snapshots: project.snapshots || [],
      })),
      suggestions,
    };
  }

  private generateGreeting(currentProjectName?: string): string {
    const greetings = [
      "Hi! I'm OCTOBOT 🐙",
      "Hey there! I'm OCTOBOT 🐙",
      "Welcome back! I'm OCTOBOT 🐙",
    ];

    const base = greetings[Math.floor(Math.random() * greetings.length)];

    if (currentProjectName) {
      return `${base} I see you're working on "${currentProjectName}". How can I help?`;
    }

    return `${base} I can help with software development and your OCTOPUS workspace.`;
  }

  private generateDefaultSuggestions(context: {
    projectCount: number;
    snapshotCount: number;
    projects: Array<{ id: string; name: string; color: string; snapshotCount: number }>;
  }): string[] {
    const suggestions: string[] = [];

    if (context.projectCount === 0) {
      suggestions.push('Create my first project');
      suggestions.push('What is OCTOPUS?');
    } else if (context.projectCount === 1) {
      suggestions.push(`How many snapshots does ${context.projects[0]?.name} have?`);
      suggestions.push('Show me my projects');
    } else {
      suggestions.push('Show my projects');
      suggestions.push('Which project has the most snapshots?');
    }

    if (context.snapshotCount === 0) {
      suggestions.push('How do I create a snapshot?');
    } else {
      suggestions.push('What is my latest snapshot?');
    }

    suggestions.push('What is Blueprint?');

    return suggestions.slice(0, 4); // Return top 4 suggestions
  }

  private generateSuggestions(
    intent: string,
    context: {
      projectCount: number;
      snapshotCount: number;
      projects: Array<{ id: string; name: string; color: string; snapshotCount: number }>;
    },
  ): string[] {
    const suggestions: string[] = [];

    // Based on the current intent, suggest follow-up questions
    switch (intent) {
      case 'PROJECT_COUNT':
        if (context.projectCount > 0) {
          suggestions.push('Show my projects');
          suggestions.push('Which project has the most snapshots?');
        } else {
          suggestions.push('What is OCTOPUS?');
          suggestions.push('How do I create a project?');
        }
        break;

      case 'PROJECT_LIST':
        suggestions.push('Tell me about a specific project');
        suggestions.push('How many snapshots do I have?');
        break;

      case 'SNAPSHOT_COUNT':
        suggestions.push('What is my latest snapshot?');
        suggestions.push('How do I create a snapshot?');
        break;

      case 'WHAT_IS_OCTOPUS':
      case 'WHAT_IS_SNAPSHOT':
      case 'WHAT_IS_BLUEPRINT':
        suggestions.push('Show my projects');
        suggestions.push('How do I create a snapshot?');
        break;

      case 'RESTORE_GUIDANCE':
        suggestions.push('How do snapshots work?');
        suggestions.push('Can I delete a snapshot?');
        break;

      default:
        // Generate contextual suggestions
        if (context.projectCount > 0) {
          suggestions.push('Show my projects');
        }
        suggestions.push('What is OCTOPUS?');
        if (context.snapshotCount === 0) {
          suggestions.push('How do I create a snapshot?');
        }
        break;
    }

    return suggestions.slice(0, 4); // Return top 4 suggestions
  }

  private createBlockedResponse(message: string): OctoResponse {
    const summary = {
      greeting: "I'm here to help with your OCTOPUS workspace.",
      projectCount: 0,
      snapshotCount: 0,
      assistantMode: this.aiProvider.isConfigured() ? 'live' as const : 'offline' as const,
      projects: [],
      suggestions: [
        'What is OCTOPUS?',
        'Show my projects',
        'How do I create a snapshot?',
        'What is Secret Vault?',
      ],
    };

    return {
      reply: message,
      intent: 'BLOCK_PASSWORD_REQUEST', // Generic blocked intent
      suggestions: summary.suggestions,
      summary,
    };
  }
}
