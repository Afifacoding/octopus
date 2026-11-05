export type GuideStepDefinition = {
  id: string;
  checklist: ReadonlyArray<{ id: string }>;
};

export type IntegrationGuideProgress = {
  activeStepIndex: number;
  completedStepIds: string[];
  checkedItemIds: string[];
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY_PREFIX = 'octopus-integration-guide';
const STORAGE_VERSION = 1;

export function createEmptyProgress(): IntegrationGuideProgress {
  return { activeStepIndex: 0, completedStepIds: [], checkedItemIds: [] };
}

export function getIntegrationGuideStorageKey(userId: string | null | undefined) {
  return `${STORAGE_KEY_PREFIX}:${userId ?? 'anonymous'}`;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

/** Drops unknown step/checklist ids so stale stored progress can never break the guide. */
export function normalizeProgress(
  value: unknown,
  steps: ReadonlyArray<GuideStepDefinition>,
): IntegrationGuideProgress {
  if (!value || typeof value !== 'object') {
    return createEmptyProgress();
  }

  const raw = value as Record<string, unknown>;
  const knownStepIds = new Set(steps.map((step) => step.id));
  const knownItemIds = new Set(steps.flatMap((step) => step.checklist.map((item) => item.id)));
  const lastIndex = Math.max(0, steps.length - 1);
  const rawIndex =
    typeof raw.activeStepIndex === 'number' && Number.isFinite(raw.activeStepIndex) ? raw.activeStepIndex : 0;

  return {
    activeStepIndex: Math.min(lastIndex, Math.max(0, Math.trunc(rawIndex))),
    completedStepIds: uniqueStrings(raw.completedStepIds).filter((id) => knownStepIds.has(id)),
    checkedItemIds: uniqueStrings(raw.checkedItemIds).filter((id) => knownItemIds.has(id)),
  };
}

export function loadProgress(
  storage: StorageLike | null,
  key: string,
  steps: ReadonlyArray<GuideStepDefinition>,
): IntegrationGuideProgress {
  if (!storage) {
    return createEmptyProgress();
  }

  try {
    const stored = storage.getItem(key);
    if (!stored) {
      return createEmptyProgress();
    }

    const parsed = JSON.parse(stored) as { version?: unknown; progress?: unknown } | null;
    if (parsed?.version !== STORAGE_VERSION) {
      return createEmptyProgress();
    }

    return normalizeProgress(parsed.progress, steps);
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(storage: StorageLike | null, key: string, progress: IntegrationGuideProgress) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, progress }));
  } catch {
    // Storage can be unavailable (private mode, quota); progress then simply isn't persisted.
  }
}

export function goToStep(
  progress: IntegrationGuideProgress,
  index: number,
  stepCount: number,
): IntegrationGuideProgress {
  const nextIndex = Math.min(Math.max(0, stepCount - 1), Math.max(0, index));
  return nextIndex === progress.activeStepIndex ? progress : { ...progress, activeStepIndex: nextIndex };
}

export function toggleChecklistItem(
  progress: IntegrationGuideProgress,
  step: GuideStepDefinition,
  itemId: string,
): IntegrationGuideProgress {
  const isChecked = progress.checkedItemIds.includes(itemId);
  const checkedItemIds = isChecked
    ? progress.checkedItemIds.filter((id) => id !== itemId)
    : [...progress.checkedItemIds, itemId];

  // Unchecking an item means the step is no longer fully done.
  const completedStepIds = isChecked
    ? progress.completedStepIds.filter((id) => id !== step.id)
    : progress.completedStepIds;

  return { ...progress, checkedItemIds, completedStepIds };
}

export function setStepCompleted(
  progress: IntegrationGuideProgress,
  step: GuideStepDefinition,
  completed: boolean,
): IntegrationGuideProgress {
  if (completed) {
    return {
      ...progress,
      completedStepIds: progress.completedStepIds.includes(step.id)
        ? progress.completedStepIds
        : [...progress.completedStepIds, step.id],
      checkedItemIds: [...new Set([...progress.checkedItemIds, ...step.checklist.map((item) => item.id)])],
    };
  }

  return {
    ...progress,
    completedStepIds: progress.completedStepIds.filter((id) => id !== step.id),
  };
}

export function isStepCompleted(progress: IntegrationGuideProgress, stepId: string) {
  return progress.completedStepIds.includes(stepId);
}

export function countCheckedItems(progress: IntegrationGuideProgress, step: GuideStepDefinition) {
  return step.checklist.filter((item) => progress.checkedItemIds.includes(item.id)).length;
}

export function isGuideComplete(progress: IntegrationGuideProgress, steps: ReadonlyArray<GuideStepDefinition>) {
  return steps.length > 0 && steps.every((step) => progress.completedStepIds.includes(step.id));
}

export function getCompletionPercent(progress: IntegrationGuideProgress, steps: ReadonlyArray<GuideStepDefinition>) {
  if (steps.length === 0) {
    return 0;
  }

  const completed = steps.filter((step) => progress.completedStepIds.includes(step.id)).length;
  return Math.round((completed / steps.length) * 100);
}
