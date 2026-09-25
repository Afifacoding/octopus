/**
 * Octo Knowledge Base
 * Centralized knowledge for OCTOPUS concepts and guidance
 */

export const OCTO_KNOWLEDGE = {
  // OCTOPUS Concepts
  OCTOPUS:
    'OCTOPUS is a developer platform for securely capturing, storing, understanding, and restoring complete software projects. It helps teams create instant snapshots of their codebase and restore them at any time.',
  INSTANT_REBIRTH:
    'Instant Rebirth is OCTOPUS core feature that allows you to restore your entire project to a previous point in time, instantly recovering your full codebase and configuration.',
  SNAPSHOT:
    'A Snapshot is a complete capture of your project at a specific moment in time, including all files, directories, configuration, and detected metadata. You can restore your project to any previous snapshot.',
  BLUEPRINT:
    'Blueprint is OCTOPUS reconstruction view of a snapshot. It summarizes the detected project identity, technology stack, architecture, configuration, environment requirements, database information, deployment details, and run instructions.',
  SECRET_VAULT:
    'Secret Vault is OCTOPUS secure storage for sensitive environment variables and credentials. Values are encrypted at rest and access is controlled through authentication sessions.',
  PROJECT_COLOR:
    'Project Color is a visual label assigned to each project for organization and quick identification. Colors help you categorize and distinguish between different projects in your workspace.',

  // Project Management
  PROJECT_MANAGEMENT:
    'Projects are the core organizational unit in OCTOPUS. Each project can have multiple snapshots. You can create, update, delete, and restore projects from the Projects page.',
  PROJECT_DELETION:
    'To delete a project, all of its snapshots must first be deleted. This ensures you cannot accidentally lose all restore points for a project.',
  PROJECT_CREATION:
    'You can create new projects through the Projects page or by connecting your VS Code workspace with the OCTOPUS extension.',

  // Snapshot Management
  SNAPSHOT_DELETION:
    'You can delete individual snapshots to free up storage. Deleting a snapshot removes that restore point but does not affect your current project or other snapshots.',
  SNAPSHOT_RESTORATION:
    'Restoring a snapshot brings your project back to the exact state it was in when the snapshot was created. This includes all files, directories, and configuration. Your current project code is replaced with the snapshot content.',
  SNAPSHOT_CREATION:
    'Snapshots are created from your VS Code workspace using the OCTOPUS extension. Click "Snapshot Now" to capture your current project state.',

  // Security & Best Practices
  SECURITY_BASICS:
    'OCTOPUS stores all snapshots with SHA-256 hashing and encryption. Your Secret Vault values are encrypted at rest and require authentication to access.',
  SECRET_MANAGEMENT:
    'Keep sensitive values like API keys, database passwords, and tokens in Secret Vault, not in your code. OCTOPUS automatically protects these values across snapshots.',
  BACKUP_STRATEGY:
    'Create snapshots regularly before major changes. Snapshots act as restore points, allowing you to recover your project if something goes wrong.',

  // Navigation
  NAVIGATION_HELP:
    'Use the sidebar to navigate between Dashboard (overview), Projects (manage your projects), and Octo (this assistant). Each page provides tools for managing your workspace.',
};

export type KnowledgeTopic = keyof typeof OCTO_KNOWLEDGE;

export function getKnowledge(topic: KnowledgeTopic): string | undefined {
  return OCTO_KNOWLEDGE[topic];
}

export function getAllTopics(): KnowledgeTopic[] {
  return Object.keys(OCTO_KNOWLEDGE) as KnowledgeTopic[];
}
