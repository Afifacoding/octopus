/**
 * Octo Service
 * Orchestrates Octo intelligence: intent matching, security checks, context building, response generation
 */

import { ProjectsRepository } from '../projects/projects.repository.js';
import { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import { OctoContextBuilder } from './octo.context.js';
import { OctoResponseEngine } from './octo.engine.js';
import { matchIntent, getContextualProjectId, extractProjectName } from './octo.intents.js';
import { checkSecurityBoundary } from './octo.security.js';
import type { OctoPageContext, OctoRequest, OctoResponse, OctoSummary } from './octo.types.js';

export class OctoService {
  private contextBuilder: OctoContextBuilder;
  private responseEngine: OctoResponseEngine;

  constructor(
    private projectsRepository: ProjectsRepository,
    private snapshotsRepository: SnapshotsRepository,
  ) {
    this.contextBuilder = new OctoContextBuilder(projectsRepository, snapshotsRepository);
    this.responseEngine = new OctoResponseEngine();
  }

  async ask(request: OctoRequest): Promise<OctoResponse> {
    // 1. Match intent from question
    const intentMatch = matchIntent(request.question);

    // 2. Check security boundary
    const securityCheck = checkSecurityBoundary(request.question, intentMatch);
    if (securityCheck.isBlocked) {
      return this.createBlockedResponse(securityCheck.message || 'I cannot provide that information.', request);
    }

    // 3. Build workspace context
    const context = await this.contextBuilder.buildContext(request.userId, request.projectId);

    // 4. Handle project name extraction
    let projectNameForResponse = extractProjectName(request.question);
    if (!projectNameForResponse && request.projectId) {
      const project = context.projects.find((p) => p.id === request.projectId);
      if (project) {
        projectNameForResponse = project.name;
      }
    }

    // 5. Generate natural language response
    const reply = this.responseEngine.generateResponse(intentMatch.intent, context, projectNameForResponse);

    // 6. Generate suggestions for next questions
    const suggestions = this.generateSuggestions(intentMatch.intent, context);

    // 7. Build summary
    const summary = this.buildSummary(context);

    return {
      reply,
      intent: intentMatch.intent,
      suggestions,
      summary,
    };
  }

  async getSummary(userId: string, projectId?: string): Promise<OctoSummary> {
    const context = await this.contextBuilder.buildContext(userId, projectId);
    return this.buildSummary(context);
  }

  private buildSummary(context: {
    projectCount: number;
    snapshotCount: number;
    projects: Array<{ id: string; name: string; color: string; snapshotCount: number }>;
    currentProjectName?: string;
  }): OctoSummary {
    const greeting = this.generateGreeting(context.currentProjectName);

    const suggestions = this.generateDefaultSuggestions(context);

    return {
      greeting,
      projectCount: context.projectCount,
      snapshotCount: context.snapshotCount,
      suggestions,
    };
  }

  private generateGreeting(currentProjectName?: string): string {
    const greetings = [
      "Hi! I'm Octo 🐙",
      "Hey there! I'm Octo 🐙",
      "Welcome back! I'm Octo 🐙",
    ];

    const base = greetings[Math.floor(Math.random() * greetings.length)];

    if (currentProjectName) {
      return `${base} I see you're working on "${currentProjectName}". How can I help?`;
    }

    return `${base} I can help you understand your projects, snapshots, Blueprints, and OCTOPUS workflows.`;
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

  private createBlockedResponse(message: string, request: OctoRequest): OctoResponse {
    const summary = {
      greeting: "I'm here to help with your OCTOPUS workspace.",
      projectCount: 0,
      snapshotCount: 0,
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
