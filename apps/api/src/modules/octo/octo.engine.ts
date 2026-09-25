/**
 * Octo Response Engine
 * Generates natural language responses based on intents and workspace data
 */

import type { OctoIntentType } from './octo.types.js';
import { OCTO_KNOWLEDGE } from './octo.knowledge.js';
import type { WorkspaceContext } from './octo.types.js';

export class OctoResponseEngine {
  generateResponse(
    intent: OctoIntentType,
    context: WorkspaceContext,
    projectName?: string,
  ): string {
    switch (intent) {
      // Project Responses
      case 'PROJECT_COUNT':
        return this.generateProjectCountResponse(context);

      case 'PROJECT_LIST':
        return this.generateProjectListResponse(context);

      case 'PROJECT_DETAILS':
        return this.generateProjectDetailsResponse(context, projectName);

      case 'PROJECT_DELETE_GUIDANCE':
        return this.generateProjectDeleteGuidanceResponse();

      case 'PROJECT_EDIT_GUIDANCE':
        return this.generateProjectEditGuidanceResponse();

      // Snapshot Responses
      case 'SNAPSHOT_COUNT':
        return this.generateSnapshotCountResponse(context);

      case 'SNAPSHOT_COUNT_IN_PROJECT':
        return this.generateSnapshotCountInProjectResponse(context, projectName);

      case 'LATEST_SNAPSHOT':
        return this.generateLatestSnapshotResponse(context);

      case 'PROJECT_WITH_MOST_SNAPSHOTS':
        return this.generateMostSnapshotsProjectResponse(context);

      case 'SNAPSHOT_DELETE_BEHAVIOR':
        return this.generateSnapshotDeleteBehaviorResponse();

      case 'RESTORE_GUIDANCE':
        return this.generateRestoreGuidanceResponse();

      // Blueprint Responses
      case 'BLUEPRINT_EXPLANATION':
        return OCTO_KNOWLEDGE.BLUEPRINT;

      case 'BLUEPRINT_ARCHITECTURE':
        return this.generateBlueprintArchitectureResponse();

      case 'BLUEPRINT_METADATA':
        return this.generateBlueprintMetadataResponse();

      // Structure Responses
      case 'PROJECT_STRUCTURE':
        return this.generateProjectStructureResponse();

      case 'FRAMEWORK_DETECTION':
        return this.generateFrameworkDetectionResponse();

      // OCTOPUS Concept Responses
      case 'WHAT_IS_OCTOPUS':
        return OCTO_KNOWLEDGE.OCTOPUS;

      case 'WHAT_IS_SNAPSHOT':
        return OCTO_KNOWLEDGE.SNAPSHOT;

      case 'WHAT_IS_BLUEPRINT':
        return OCTO_KNOWLEDGE.BLUEPRINT;

      case 'WHAT_IS_SECRET_VAULT':
        return OCTO_KNOWLEDGE.SECRET_VAULT;

      case 'WHAT_IS_INSTANT_REBIRTH':
        return OCTO_KNOWLEDGE.INSTANT_REBIRTH;

      case 'WHAT_IS_PROJECT_COLOR':
        return OCTO_KNOWLEDGE.PROJECT_COLOR;

      // Navigation Responses
      case 'NAVIGATE_TO_SNAPSHOTS':
        return this.generateNavigateToSnapshotsResponse();

      case 'NAVIGATE_TO_BLUEPRINT':
        return this.generateNavigateToBlueprintResponse();

      case 'NAVIGATE_TO_SECRETS':
        return this.generateNavigateToSecretsResponse();

      case 'WHERE_CAN_I_EDIT_PROJECT':
        return this.generateWhereCanIEditProjectResponse();

      default:
        return this.generateUnknownIntentResponse();
    }
  }

  private generateProjectCountResponse(context: WorkspaceContext): string {
    if (context.projectCount === 0) {
      return "You currently don't have any projects yet. Create your first project by connecting your workspace with the OCTOPUS extension.";
    }

    if (context.projectCount === 1) {
      return 'You currently have 1 project in OCTOPUS.';
    }

    return `You currently have ${context.projectCount} projects in OCTOPUS.`;
  }

  private generateProjectListResponse(context: WorkspaceContext): string {
    if (context.projects.length === 0) {
      return "You don't have any projects yet. Start by creating your first project.";
    }

    const projectList = context.projects
      .map((p) => `• ${p.name} (${p.snapshotCount} snapshot${p.snapshotCount !== 1 ? 's' : ''})`)
      .join('\n');

    return `Here are your projects:\n\n${projectList}`;
  }

  private generateProjectDetailsResponse(context: WorkspaceContext, projectName?: string): string {
    if (!projectName) {
      if (context.currentProjectName) {
        projectName = context.currentProjectName;
      } else {
        return 'To get project details, you can ask about a specific project by name, like "Tell me about Project X".';
      }
    }

    const project = context.projects.find((p) => p.name.toLowerCase() === projectName!.toLowerCase());

    if (!project) {
      return `I couldn't find a project named "${projectName}" in your workspace.`;
    }

    return `Project: ${project.name}\nSnapshots: ${project.snapshotCount}\nColor: ${project.color}\n\nYou can view more details on the project's detail page.`;
  }

  private generateProjectDeleteGuidanceResponse(): string {
    return 'To delete a project, you must first delete all of its snapshots. This ensures you cannot accidentally lose all restore points. Once all snapshots are deleted, you can delete the project from the Projects page.';
  }

  private generateProjectEditGuidanceResponse(): string {
    return 'You can edit a project by opening it from the Projects page and updating its name, description, or color. Changes are saved immediately.';
  }

  private generateSnapshotCountResponse(context: WorkspaceContext): string {
    if (context.snapshotCount === 0) {
      return "You don't have any snapshots yet. Create your first snapshot by clicking 'Snapshot Now' from the Dashboard or using the OCTOPUS extension in VS Code.";
    }

    if (context.snapshotCount === 1) {
      return 'You currently have 1 snapshot total across all projects.';
    }

    return `You currently have ${context.snapshotCount} snapshots total across all projects.`;
  }

  private generateSnapshotCountInProjectResponse(context: WorkspaceContext, projectName?: string): string {
    if (!projectName) {
      if (context.currentProjectName) {
        projectName = context.currentProjectName;
      } else {
        return 'To get snapshot count for a project, ask about a specific project by name, like "How many snapshots does Project X have?".';
      }
    }

    const project = context.projects.find((p) => p.name.toLowerCase() === projectName!.toLowerCase());

    if (!project) {
      return `I couldn't find a project named "${projectName}" in your workspace.`;
    }

    if (project.snapshotCount === 0) {
      return `Project "${project.name}" doesn't have any snapshots yet.`;
    }

    if (project.snapshotCount === 1) {
      return `Project "${project.name}" has 1 snapshot.`;
    }

    return `Project "${project.name}" has ${project.snapshotCount} snapshots.`;
  }

  private generateLatestSnapshotResponse(context: WorkspaceContext): string {
    return 'You can view your latest snapshot by opening the project and navigating to its snapshots page. The most recent snapshot will be listed at the top.';
  }

  private generateMostSnapshotsProjectResponse(context: WorkspaceContext): string {
    if (context.projects.length === 0) {
      return "You don't have any projects yet.";
    }

    const projectsWithSnapshots = context.projects.filter((p) => p.snapshotCount > 0);

    if (projectsWithSnapshots.length === 0) {
      return "None of your projects have snapshots yet. Create a snapshot by clicking 'Snapshot Now' or using the VS Code extension.";
    }

    const maxProject = projectsWithSnapshots.reduce((prev, current) =>
      current.snapshotCount > prev.snapshotCount ? current : prev,
    );

    return `Project "${maxProject.name}" has the most snapshots with ${maxProject.snapshotCount} total.`;
  }

  private generateSnapshotDeleteBehaviorResponse(): string {
    return 'When you delete a snapshot, that restore point is permanently removed. However, deleting a snapshot does not affect your current project or other snapshots. You can continue to restore to any remaining snapshot.';
  }

  private generateRestoreGuidanceResponse(): string {
    return 'To restore a project to a previous snapshot, navigate to the project, open the Snapshots page, find the snapshot you want to restore, and click Restore. Your current project will be replaced with the snapshot content. Be careful—this action cannot be undone.';
  }

  private generateBlueprintArchitectureResponse(): string {
    return 'Blueprint shows your project architecture including the detected technology stack, framework, run commands, environment variables, database configuration, and deployment information. You can view it by opening a snapshot and clicking the Blueprint tab.';
  }

  private generateBlueprintMetadataResponse(): string {
    return "Blueprint contains detected metadata about your project, including its structure, technologies, configuration, and deployment setup. Access it by viewing a snapshot's Blueprint page.";
  }

  private generateProjectStructureResponse(): string {
    return 'You can explore your project structure by opening a snapshot and visiting the Directory Tree page. It shows all files and folders exactly as they were when the snapshot was created.';
  }

  private generateFrameworkDetectionResponse(): string {
    return 'Blueprint automatically detects your project\'s framework and technology stack based on configuration files, dependencies, and code structure. View this information on any snapshot\'s Blueprint page.';
  }

  private generateNavigateToSnapshotsResponse(): string {
    return 'To view your snapshots, open a project from the Projects page and select Snapshots. This shows all snapshots for that project with creation dates and options to restore or delete.';
  }

  private generateNavigateToBlueprintResponse(): string {
    return 'To view Blueprint, open a snapshot and click the Blueprint tab. This shows the detected project identity, technology stack, architecture, and configuration information.';
  }

  private generateNavigateToSecretsResponse(): string {
    return 'Your secrets and sensitive environment variables are managed through Secret Vault. Access it by opening a project and clicking Secret Vault. All values are encrypted and require authentication.';
  }

  private generateWhereCanIEditProjectResponse(): string {
    return 'You can edit a project by opening it from the Projects page. Click on any project to view and edit its details including name, description, and color.';
  }

  private generateUnknownIntentResponse(): string {
    return "I'm not sure what you're asking yet. I can help with:\n• Projects (count, list, details, deletion)\n• Snapshots (count, restore, deletion)\n• Blueprint (explanation, architecture)\n• OCTOPUS concepts and guidance\n• Navigation help\n\nTry asking something like 'How many projects do I have?' or 'What is Blueprint?'";
  }
}
