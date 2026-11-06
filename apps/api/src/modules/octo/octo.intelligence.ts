/**
 * OCTOBOT Project & Snapshot Intelligence
 * Deterministic, owner-scoped answers about projects, snapshots and snapshot
 * comparisons. Structured results are returned verbatim from the backend and
 * are never rewritten by a free-form AI provider.
 */

import { HttpError } from '../../core/errors/http-error.js';
import type { SnapshotsRepository } from '../snapshots/snapshots.repository.js';
import type { SnapshotComparisonResponse, SnapshotsService } from '../snapshots/snapshots.service.js';
import type { PublicSnapshot } from '../snapshots/snapshots.types.js';
import type {
  OctoComparisonSnapshotRef,
  OctoIntelligencePayload,
  OctoSnapshotComparison,
  OctoSnapshotSummary,
  OctoWorkspaceStats,
  WorkspaceContext,
  WorkspaceProjectContext,
} from './octo.types.js';

export const COUNTING_RULES = [
  'Only active projects you own are counted; archived projects are excluded.',
  'Snapshot counts include completed snapshots only.',
  'Failed and in-progress (pending or processing) snapshots are reported separately.',
  'Snapshot numbers (#1, #2, ...) follow capture order of completed snapshots, #1 being the oldest.',
];

const MAX_LISTED_SNAPSHOTS = 20;
const MAX_REPLY_PATHS = 15;
const MAX_FACT_PATHS = 40;

export type SnapshotSelector =
  | { type: 'sequence'; value: number }
  | { type: 'id'; value: string };

export type IntelligenceQuery =
  | { kind: 'PROJECT_COUNT' }
  | { kind: 'PROJECT_LIST' }
  | { kind: 'SNAPSHOT_COUNTS' }
  | { kind: 'MOST_SNAPSHOTS' }
  | { kind: 'LATEST_SNAPSHOT' }
  | { kind: 'LIST_SNAPSHOTS' }
  | { kind: 'COMPARE'; base?: SnapshotSelector; target?: SnapshotSelector };

export type IntelligenceAnswer = {
  reply: string;
  facts: Record<string, unknown> | null;
  payload?: OctoIntelligencePayload;
};

type IntelligenceSnapshotsService = Partial<Pick<SnapshotsService, 'listSnapshots' | 'compareSnapshots'>>;

const SNAPSHOT_ID_PATTERN = /\b(c[a-z0-9]{20,31})\b/g;

/**
 * Recognizes project and snapshot intelligence questions. Returns null for
 * anything else so general questions keep their existing flow.
 */
export function detectIntelligenceQuery(question: string): IntelligenceQuery | null {
  const q = question.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return null;

  const mentionsSnapshot = /\bsnapshots?\b/.test(q);
  const snapshotIds = [...new Set([...q.matchAll(SNAPSHOT_ID_PATTERN)].map((match) => match[1] as string))];
  const compareVerb = /\b(compare|comparison|diff|difference|differences|versus|vs)\b/.test(q);
  const evolutionWords = /\b(changed|changes|evolved|evolution|evolve)\b/.test(q);
  const fileChangeQuestion = /\bfiles?\b/.test(q) && /\b(added|modified|deleted|removed|changed)\b/.test(q);

  if (
    (compareVerb && (mentionsSnapshot || snapshotIds.length >= 2)) ||
    (evolutionWords && (mentionsSnapshot || /\bprojects?\b/.test(q))) ||
    fileChangeQuestion
  ) {
    return { kind: 'COMPARE', ...extractCompareSelectors(q, snapshotIds) };
  }

  if (/\b(latest|most recent|newest|last)\s+(completed\s+)?snapshots?\b/.test(q)) {
    return { kind: 'LATEST_SNAPSHOT' };
  }

  if (/\b(most|highest number of|largest number of|biggest number of)\b.*\bsnapshots\b/.test(q)) {
    return { kind: 'MOST_SNAPSHOTS' };
  }

  if (
    /\bhow many snapshots\b/.test(q) ||
    /\bnumber of snapshots\b/.test(q) ||
    /\bsnapshot counts?\b/.test(q) ||
    /\bsnapshots? (are )?(in|per) each\b/.test(q) ||
    /\bcount\b.*\bsnapshots\b/.test(q)
  ) {
    return { kind: 'SNAPSHOT_COUNTS' };
  }

  if (/\b(list|show|display|view|see|what are)\b.*\bsnapshots\b/.test(q)) {
    return { kind: 'LIST_SNAPSHOTS' };
  }

  if (
    /\bhow many projects\b/.test(q) ||
    /\bnumber of projects\b/.test(q) ||
    /\bproject count\b/.test(q) ||
    /\btotal (number of )?projects\b/.test(q) ||
    /\bcount\b.*\bprojects\b/.test(q)
  ) {
    return { kind: 'PROJECT_COUNT' };
  }

  if (/\b(list|show|display|view|see|what are)\b.*\bprojects\b/.test(q)) {
    return { kind: 'PROJECT_LIST' };
  }

  return null;
}

function extractCompareSelectors(
  q: string,
  snapshotIds: string[],
): { base?: SnapshotSelector; target?: SnapshotSelector } {
  if (snapshotIds.length >= 2) {
    return {
      base: { type: 'id', value: snapshotIds[0] as string },
      target: { type: 'id', value: snapshotIds[1] as string },
    };
  }

  const pairPatterns = [
    /snapshots?\s*#?\s*(\d{1,4})\s*(?:and|to|vs\.?|versus|with|&|,)\s*(?:snapshot\s*)?#?\s*(\d{1,4})\b/,
    /between\s*(?:snapshots?\s*)?#?\s*(\d{1,4})\s*and\s*(?:snapshot\s*)?#?\s*(\d{1,4})\b/,
    /#(\d{1,4})\s*(?:and|to|vs\.?|versus|with|&|,)\s*#(\d{1,4})\b/,
  ];

  for (const pattern of pairPatterns) {
    const match = pattern.exec(q);
    if (!match) continue;

    const first = Number(match[1]);
    const second = Number(match[2]);
    return {
      base: { type: 'sequence', value: Math.min(first, second) },
      target: { type: 'sequence', value: Math.max(first, second) },
    };
  }

  return {};
}

/**
 * Picks the most specific project name mentioned in the question.
 */
export function findProjectMentionedInQuestion(
  question: string,
  projects: WorkspaceProjectContext[],
): WorkspaceProjectContext | undefined {
  const q = question.toLowerCase();
  return projects
    .filter((project) => project.name.trim() && q.includes(project.name.toLowerCase().trim()))
    .sort((left, right) => right.name.length - left.name.length)[0];
}

export function buildWorkspaceStats(context: WorkspaceContext): OctoWorkspaceStats {
  const projects = context.projects.map((project) => ({
    id: project.id,
    name: project.name,
    color: project.color,
    completedSnapshots: project.snapshotCount,
    failedSnapshots: project.failedSnapshotCount ?? 0,
    inProgressSnapshots: project.inProgressSnapshotCount ?? 0,
    latestSnapshotAt: project.latestSnapshotAt ?? project.snapshots?.[0]?.createdAt ?? null,
  }));

  const highest = projects.reduce((max, project) => Math.max(max, project.completedSnapshots), 0);
  const mostSnapshots = highest > 0
    ? {
        count: highest,
        projects: projects
          .filter((project) => project.completedSnapshots === highest)
          .map(({ id, name }) => ({ id, name })),
      }
    : null;

  let latestSnapshot: OctoWorkspaceStats['latestSnapshot'] = null;
  for (const project of context.projects) {
    const newest = project.snapshots?.[0];
    if (newest && (!latestSnapshot || newest.createdAt > latestSnapshot.createdAt)) {
      latestSnapshot = {
        projectId: project.id,
        projectName: project.name,
        snapshotId: newest.id,
        createdAt: newest.createdAt,
      };
    }
  }

  return {
    countingRules: COUNTING_RULES,
    projectCount: context.projectCount,
    completedSnapshotCount: projects.reduce((sum, project) => sum + project.completedSnapshots, 0),
    failedSnapshotCount: projects.reduce((sum, project) => sum + project.failedSnapshots, 0),
    inProgressSnapshotCount: projects.reduce((sum, project) => sum + project.inProgressSnapshots, 0),
    projects,
    mostSnapshots,
    latestSnapshot,
  };
}

/**
 * Completed snapshots are numbered in capture order: #1 is the oldest.
 */
function buildSequenceMap(snapshots: Array<{ id: string; status: string; createdAt: string }>) {
  const completed = snapshots
    .filter((snapshot) => snapshot.status === 'COMPLETED')
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? (left.id < right.id ? -1 : 1)
        : (left.createdAt < right.createdAt ? -1 : 1),
    );

  return new Map(completed.map((snapshot, index) => [snapshot.id, index + 1]));
}

function toSnapshotSummary(snapshot: PublicSnapshot, sequences: Map<string, number>): OctoSnapshotSummary {
  return {
    id: snapshot.id,
    sequence: sequences.get(snapshot.id) ?? null,
    status: snapshot.status,
    captureSource: snapshot.captureSource,
    clientName: snapshot.clientName,
    clientVersion: snapshot.clientVersion,
    createdAt: snapshot.createdAt,
    processedAt: snapshot.processedAt,
    fileCount: snapshot.fileCount,
    directoryCount: snapshot.directoryCount,
    archiveSizeBytes: snapshot.archiveSizeBytes,
    failureCode: snapshot.failureCode,
  };
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return 'unknown size';
  const sign = bytes < 0 ? '-' : '';
  const value = Math.abs(bytes);
  if (value < 1024) return `${sign}${value} B`;
  if (value < 1024 * 1024) return `${sign}${(value / 1024).toFixed(1)} KB`;
  return `${sign}${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function snapshotLabel(ref: { sequence: number | null; id: string }) {
  return ref.sequence !== null ? `snapshot #${ref.sequence}` : `snapshot ${ref.id}`;
}

export class OctoIntelligenceService {
  constructor(
    private readonly snapshotsRepository: Pick<SnapshotsRepository, 'findProjectByIdForOwner'>,
    private readonly snapshotsService?: IntelligenceSnapshotsService,
  ) {}

  async listProjectSnapshots(userId: string, projectId: string) {
    const project = await this.requireOwnedProject(userId, projectId);
    const snapshots = await this.loadSnapshots(userId, projectId);
    const sequences = buildSequenceMap(snapshots);

    return {
      project,
      snapshots: snapshots.map((snapshot) => toSnapshotSummary(snapshot, sequences)),
    };
  }

  async getSnapshotDetails(userId: string, projectId: string, snapshotId: string) {
    const { project, snapshots } = await this.listProjectSnapshots(userId, projectId);
    const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) {
      throw new HttpError(404, 'SNAPSHOT_NOT_FOUND', 'Snapshot not found');
    }

    return { project, snapshot };
  }

  async compareSnapshots(
    userId: string,
    projectId: string,
    baseSnapshotId: string,
    targetSnapshotId: string,
  ): Promise<OctoSnapshotComparison> {
    const { project, snapshots } = await this.listProjectSnapshots(userId, projectId);
    return this.runComparison(userId, project, snapshots, baseSnapshotId, targetSnapshotId);
  }

  async answer(
    query: IntelligenceQuery,
    input: { userId: string; question: string; context: WorkspaceContext; projectId?: string | undefined },
  ): Promise<IntelligenceAnswer> {
    const { context } = input;
    const stats = buildWorkspaceStats(context);

    switch (query.kind) {
      case 'PROJECT_COUNT':
        return {
          reply: `You have ${plural(stats.projectCount, 'active project')}. Archived projects are not included.`,
          facts: { projectCount: stats.projectCount, countingRules: [COUNTING_RULES[0]] },
          payload: { kind: 'WORKSPACE_STATS', stats },
        };
      case 'PROJECT_LIST':
        return this.answerProjectList(stats);
      case 'SNAPSHOT_COUNTS':
        return this.answerSnapshotCounts(stats, input.question, context);
      case 'MOST_SNAPSHOTS':
        return this.answerMostSnapshots(stats);
      case 'LATEST_SNAPSHOT':
        return this.answerLatestSnapshot(input, stats);
      case 'LIST_SNAPSHOTS':
        return this.answerListSnapshots(input);
      case 'COMPARE':
        return this.answerCompare(query, input);
    }
  }

  private answerProjectList(stats: OctoWorkspaceStats): IntelligenceAnswer {
    if (stats.projectCount === 0) {
      return {
        reply: 'You do not have any active projects yet. Create a project, then save a snapshot from the OCTOPUS Ghost VS Code extension.',
        facts: { projectCount: 0 },
        payload: { kind: 'WORKSPACE_STATS', stats },
      };
    }

    const lines = stats.projects.map(
      (project) => `• ${project.name} — ${plural(project.completedSnapshots, 'completed snapshot')}`,
    );
    return {
      reply: `You have ${plural(stats.projectCount, 'active project')}:\n${lines.join('\n')}`,
      facts: {
        projectCount: stats.projectCount,
        projects: stats.projects.map(({ name, completedSnapshots }) => ({ name, completedSnapshots })),
      },
      payload: { kind: 'WORKSPACE_STATS', stats },
    };
  }

  private answerSnapshotCounts(stats: OctoWorkspaceStats, question: string, context: WorkspaceContext): IntelligenceAnswer {
    const mentioned = findProjectMentionedInQuestion(question, context.projects);
    if (mentioned) {
      const project = stats.projects.find((candidate) => candidate.id === mentioned.id);
      if (project) {
        return {
          reply: `${project.name} has ${plural(project.completedSnapshots, 'completed snapshot')}${this.describeOtherStatuses(project.failedSnapshots, project.inProgressSnapshots)}.`,
          facts: { project },
          payload: { kind: 'WORKSPACE_STATS', stats },
        };
      }
    }

    if (stats.projectCount === 0) {
      return {
        reply: 'You do not have any active projects, so there are no snapshots to count.',
        facts: { projectCount: 0, completedSnapshotCount: 0 },
        payload: { kind: 'WORKSPACE_STATS', stats },
      };
    }

    const lines = stats.projects.map(
      (project) =>
        `• ${project.name}: ${plural(project.completedSnapshots, 'completed snapshot')}${this.describeOtherStatuses(project.failedSnapshots, project.inProgressSnapshots)}`,
    );
    return {
      reply: [
        `You have ${plural(stats.completedSnapshotCount, 'completed snapshot')} across ${plural(stats.projectCount, 'active project')}:`,
        ...lines,
        'Only completed snapshots are counted; failed and in-progress snapshots are shown separately.',
      ].join('\n'),
      facts: {
        completedSnapshotCount: stats.completedSnapshotCount,
        failedSnapshotCount: stats.failedSnapshotCount,
        inProgressSnapshotCount: stats.inProgressSnapshotCount,
        projects: stats.projects.map(({ name, completedSnapshots, failedSnapshots, inProgressSnapshots }) => ({
          name,
          completedSnapshots,
          failedSnapshots,
          inProgressSnapshots,
        })),
        countingRules: COUNTING_RULES,
      },
      payload: { kind: 'WORKSPACE_STATS', stats },
    };
  }

  private describeOtherStatuses(failed: number, inProgress: number) {
    const parts = [
      failed > 0 ? `${failed} failed` : '',
      inProgress > 0 ? `${inProgress} in progress` : '',
    ].filter(Boolean);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }

  private answerMostSnapshots(stats: OctoWorkspaceStats): IntelligenceAnswer {
    if (!stats.mostSnapshots) {
      return {
        reply: stats.projectCount === 0
          ? 'You do not have any active projects yet.'
          : 'None of your active projects has a completed snapshot yet.',
        facts: { mostSnapshots: null, projectCount: stats.projectCount },
        payload: { kind: 'WORKSPACE_STATS', stats },
      };
    }

    const { count, projects } = stats.mostSnapshots;
    const names = projects.map((project) => project.name);
    const reply = names.length === 1
      ? `${names[0]} has the most snapshots, with ${plural(count, 'completed snapshot')}.`
      : `${names.join(' and ')} are tied for the most snapshots, with ${plural(count, 'completed snapshot')} each.`;

    return {
      reply,
      facts: { mostSnapshots: { count, projects: names } },
      payload: { kind: 'WORKSPACE_STATS', stats },
    };
  }

  private async answerLatestSnapshot(
    input: { userId: string; question: string; context: WorkspaceContext; projectId?: string | undefined },
    stats: OctoWorkspaceStats,
  ): Promise<IntelligenceAnswer> {
    const project = this.resolveProject(input, false);

    if (!project) {
      if (!stats.latestSnapshot) {
        return {
          reply: 'You do not have any completed snapshots yet.',
          facts: { latestSnapshot: null },
          payload: { kind: 'WORKSPACE_STATS', stats },
        };
      }

      const latestProject = input.context.projects.find((candidate) => candidate.id === stats.latestSnapshot?.projectId);
      if (!latestProject) {
        return { reply: 'You do not have any completed snapshots yet.', facts: { latestSnapshot: null } };
      }

      return this.describeLatestInProject(input.userId, latestProject);
    }

    return this.describeLatestInProject(input.userId, project);
  }

  private async describeLatestInProject(userId: string, project: WorkspaceProjectContext): Promise<IntelligenceAnswer> {
    if (!this.snapshotsService?.listSnapshots) {
      const newest = project.snapshots?.[0];
      if (!newest) {
        return { reply: `${project.name} has no completed snapshots yet.`, facts: { project: project.name, latestSnapshot: null } };
      }

      return {
        reply: `The latest completed snapshot in ${project.name} was captured at ${newest.createdAt}.`,
        facts: { project: project.name, latestSnapshot: newest },
      };
    }

    const { project: owned, snapshots } = await this.listProjectSnapshots(userId, project.id);
    const latest = snapshots.find((snapshot) => snapshot.status === 'COMPLETED');
    if (!latest) {
      return {
        reply: `${owned.name} has no completed snapshots yet.`,
        facts: { project: owned.name, latestSnapshot: null },
        payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots: snapshots.slice(0, MAX_LISTED_SNAPSHOTS) },
      };
    }

    const details = [
      latest.fileCount !== null ? plural(latest.fileCount, 'file') : null,
      latest.directoryCount !== null ? plural(latest.directoryCount, 'folder') : null,
      latest.archiveSizeBytes !== null ? `${formatBytes(latest.archiveSizeBytes)} archive` : null,
    ].filter(Boolean);

    return {
      reply: `The latest completed snapshot in ${owned.name} is snapshot #${latest.sequence}, captured at ${latest.createdAt}${details.length > 0 ? ` (${details.join(', ')})` : ''}.`,
      facts: {
        project: owned.name,
        latestSnapshot: {
          number: latest.sequence,
          id: latest.id,
          createdAt: latest.createdAt,
          fileCount: latest.fileCount,
          directoryCount: latest.directoryCount,
          archiveSize: formatBytes(latest.archiveSizeBytes),
        },
      },
      payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots: snapshots.slice(0, MAX_LISTED_SNAPSHOTS) },
    };
  }

  private async answerListSnapshots(
    input: { userId: string; question: string; context: WorkspaceContext; projectId?: string | undefined },
  ): Promise<IntelligenceAnswer> {
    const project = this.resolveProject(input, true);
    if (!project) {
      return this.projectSelectionRequired(input.context);
    }

    if (!this.snapshotsService?.listSnapshots) {
      return { reply: 'Snapshot listing is unavailable right now.', facts: null };
    }

    const { project: owned, snapshots } = await this.listProjectSnapshots(input.userId, project.id);
    if (snapshots.length === 0) {
      return {
        reply: `${owned.name} has no snapshots yet. Use "Save Snapshot" in the OCTOPUS Ghost VS Code extension to capture one.`,
        facts: { project: owned.name, snapshots: [] },
        payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots: [] },
      };
    }

    const listed = snapshots.slice(0, MAX_LISTED_SNAPSHOTS);
    const lines = listed.map((snapshot) => {
      const label = snapshot.sequence !== null ? `#${snapshot.sequence}` : snapshot.status.toLowerCase();
      const files = snapshot.fileCount !== null ? `, ${plural(snapshot.fileCount, 'file')}` : '';
      return `• ${label} — ${snapshot.createdAt} — ${snapshot.status}${files}, ${formatBytes(snapshot.archiveSizeBytes)}`;
    });
    const completed = snapshots.filter((snapshot) => snapshot.status === 'COMPLETED').length;
    const more = snapshots.length > listed.length ? `\n…and ${snapshots.length - listed.length} older snapshots.` : '';

    return {
      reply: `${owned.name} has ${plural(snapshots.length, 'snapshot')} (${completed} completed), newest first:\n${lines.join('\n')}${more}`,
      facts: {
        project: owned.name,
        totalSnapshots: snapshots.length,
        completedSnapshots: completed,
        snapshots: listed.map((snapshot) => ({
          number: snapshot.sequence,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          fileCount: snapshot.fileCount,
          archiveSize: formatBytes(snapshot.archiveSizeBytes),
        })),
      },
      payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots },
    };
  }

  private async answerCompare(
    query: Extract<IntelligenceQuery, { kind: 'COMPARE' }>,
    input: { userId: string; question: string; context: WorkspaceContext; projectId?: string | undefined },
  ): Promise<IntelligenceAnswer> {
    const project = this.resolveProject(input, true);
    if (!project) {
      return this.projectSelectionRequired(input.context);
    }

    if (!this.snapshotsService?.listSnapshots || !this.snapshotsService.compareSnapshots) {
      return { reply: 'Snapshot comparison is unavailable right now.', facts: null };
    }

    const { project: owned, snapshots } = await this.listProjectSnapshots(input.userId, project.id);
    const completed = snapshots
      .filter((snapshot) => snapshot.status === 'COMPLETED' && snapshot.sequence !== null)
      .sort((left, right) => (left.sequence as number) - (right.sequence as number));

    const resolveSelector = (selector: SnapshotSelector) => {
      if (selector.type === 'id') return selector.value;
      return completed[selector.value - 1]?.id;
    };

    let baseId: string | undefined;
    let targetId: string | undefined;
    if (query.base && query.target) {
      baseId = resolveSelector(query.base);
      targetId = resolveSelector(query.target);
      if (!baseId || !targetId) {
        return {
          reply: `${owned.name} has ${plural(completed.length, 'completed snapshot')}, so I cannot find the snapshot numbers you asked for. Snapshot #1 is the oldest completed snapshot.`,
          facts: { project: owned.name, completedSnapshots: completed.length },
          payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots },
        };
      }
    } else {
      if (completed.length < 2) {
        return {
          reply: `${owned.name} needs at least two completed snapshots to compare. It currently has ${plural(completed.length, 'completed snapshot')}.`,
          facts: { project: owned.name, completedSnapshots: completed.length },
          payload: { kind: 'PROJECT_SNAPSHOTS', project: owned, snapshots },
        };
      }

      baseId = completed[completed.length - 2]?.id;
      targetId = completed[completed.length - 1]?.id;
    }

    try {
      const comparison = await this.runComparison(input.userId, owned, snapshots, baseId as string, targetId as string);
      return {
        reply: describeComparison(comparison),
        facts: comparisonFacts(comparison),
        payload: { kind: 'SNAPSHOT_COMPARISON', comparison },
      };
    } catch (error) {
      if (error instanceof HttpError && error.statusCode < 500) {
        return { reply: `I could not compare these snapshots: ${error.message}.`, facts: null };
      }

      throw error;
    }
  }

  private async runComparison(
    userId: string,
    project: { id: string; name: string },
    snapshots: OctoSnapshotSummary[],
    baseSnapshotId: string,
    targetSnapshotId: string,
  ): Promise<OctoSnapshotComparison> {
    if (!this.snapshotsService?.compareSnapshots) {
      throw new HttpError(503, 'SNAPSHOT_COMPARISON_UNAVAILABLE', 'Snapshot comparison is unavailable');
    }

    const result: SnapshotComparisonResponse = await this.snapshotsService.compareSnapshots(
      userId,
      project.id,
      baseSnapshotId,
      targetSnapshotId,
    );
    const sequences = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.sequence]));
    const withSequence = (ref: SnapshotComparisonResponse['base']): OctoComparisonSnapshotRef => ({
      ...ref,
      sequence: sequences.get(ref.id) ?? null,
    });

    return {
      projectId: project.id,
      projectName: project.name,
      base: withSequence(result.base),
      target: withSequence(result.target),
      summary: result.summary,
      added: result.added,
      modified: result.modified,
      deleted: result.deleted,
      unchanged: result.unchanged,
      truncated: result.truncated,
      directories: result.directories,
    };
  }

  private resolveProject(
    input: { question: string; context: WorkspaceContext; projectId?: string | undefined },
    allowSingleProjectFallback: boolean,
  ): WorkspaceProjectContext | undefined {
    const mentioned = findProjectMentionedInQuestion(input.question, input.context.projects);
    if (mentioned) return mentioned;

    if (input.projectId) {
      const selected = input.context.projects.find((project) => project.id === input.projectId);
      if (selected) return selected;
    }

    if (allowSingleProjectFallback && input.context.projects.length === 1) {
      return input.context.projects[0];
    }

    return undefined;
  }

  private projectSelectionRequired(context: WorkspaceContext): IntelligenceAnswer {
    if (context.projects.length === 0) {
      return { reply: 'You do not have any active projects yet.', facts: { projectCount: 0 } };
    }

    return {
      reply: `Which project do you mean? Select a project in the OCTOBOT project picker or mention it by name. Your projects: ${context.projects.map((project) => project.name).join(', ')}.`,
      facts: { projects: context.projects.map((project) => project.name) },
    };
  }

  private async requireOwnedProject(userId: string, projectId: string) {
    const project = await this.snapshotsRepository.findProjectByIdForOwner(userId, projectId);
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }

    return { id: project.id, name: project.name };
  }

  private async loadSnapshots(userId: string, projectId: string): Promise<PublicSnapshot[]> {
    if (!this.snapshotsService?.listSnapshots) {
      throw new HttpError(503, 'SNAPSHOT_LISTING_UNAVAILABLE', 'Snapshot listing is unavailable');
    }

    return this.snapshotsService.listSnapshots(userId, projectId);
  }
}

function describePaths(label: string, files: Array<{ path: string; sensitive: boolean }>, total: number) {
  if (total === 0) return null;
  const shown = files.slice(0, MAX_REPLY_PATHS).map((file) => `  - ${file.path}${file.sensitive ? ' (sensitive path; contents not shown)' : ''}`);
  const remaining = total - shown.length;
  return [`${label} (${total}):`, ...shown, ...(remaining > 0 ? [`  …and ${remaining} more`] : [])].join('\n');
}

export function describeComparison(comparison: OctoSnapshotComparison) {
  const { summary } = comparison;
  const header = `Comparison of ${comparison.projectName}: ${snapshotLabel(comparison.base)} (${comparison.base.createdAt}) → ${snapshotLabel(comparison.target)} (${comparison.target.createdAt})`;
  const totals = `${summary.added} added, ${summary.modified} modified, ${summary.deleted} deleted, ${summary.unchanged} unchanged. Files: ${summary.baseFileCount} → ${summary.targetFileCount}. Size change: ${formatBytes(summary.netSizeDeltaBytes)}.`;

  if (summary.changed === 0) {
    return `${header}\nNo files changed between these snapshots (${plural(summary.unchanged, 'file')} identical).`;
  }

  const sections = [
    describePaths('Added', comparison.added, summary.added),
    describePaths('Modified', comparison.modified, summary.modified),
    describePaths('Deleted', comparison.deleted, summary.deleted),
  ].filter(Boolean);

  const sensitive = summary.sensitiveChanged > 0
    ? `\n${plural(summary.sensitiveChanged, 'changed file')} matched sensitive-file patterns. File contents and secret values are never included in comparisons.`
    : '';

  return `${header}\n${totals}\n\n${sections.join('\n\n')}${sensitive}`;
}

export function comparisonFacts(comparison: OctoSnapshotComparison): Record<string, unknown> {
  const paths = (files: Array<{ path: string; sensitive: boolean; sizeDeltaBytes: number }>) =>
    files.slice(0, MAX_FACT_PATHS).map((file) => ({
      path: file.path,
      sizeChange: formatBytes(file.sizeDeltaBytes),
      ...(file.sensitive ? { sensitivePath: true } : {}),
    }));

  return {
    project: comparison.projectName,
    base: { number: comparison.base.sequence, createdAt: comparison.base.createdAt },
    target: { number: comparison.target.sequence, createdAt: comparison.target.createdAt },
    summary: {
      ...comparison.summary,
      netSizeChange: formatBytes(comparison.summary.netSizeDeltaBytes),
    },
    added: paths(comparison.added),
    modified: paths(comparison.modified),
    deleted: paths(comparison.deleted),
    listsTruncatedAfter: MAX_FACT_PATHS,
    topDirectories: comparison.directories.slice(0, 10),
    note: 'File contents and secret values are never included.',
  };
}
