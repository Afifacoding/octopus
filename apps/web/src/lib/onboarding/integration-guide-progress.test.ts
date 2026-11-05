import { describe, expect, it } from 'vitest';

import {
  INTEGRATION_GUIDE_STEPS,
  OCTOPUS_GHOST_EXTENSION_ID,
  OCTOPUS_GHOST_MARKETPLACE_URL,
} from './integration-guide-content';
import {
  countCheckedItems,
  createEmptyProgress,
  getCompletionPercent,
  getIntegrationGuideStorageKey,
  goToStep,
  isGuideComplete,
  isStepCompleted,
  loadProgress,
  normalizeProgress,
  saveProgress,
  setStepCompleted,
  toggleChecklistItem,
} from './integration-guide-progress';

const steps = [
  { id: 'a', checklist: [{ id: 'a1' }, { id: 'a2' }] },
  { id: 'b', checklist: [{ id: 'b1' }] },
];

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('integration guide progress', () => {
  it('builds a per-user storage key with the octopus- prefix', () => {
    expect(getIntegrationGuideStorageKey('user-1')).toBe('octopus-integration-guide:user-1');
    expect(getIntegrationGuideStorageKey(undefined)).toBe('octopus-integration-guide:anonymous');
  });

  it('round-trips progress through storage', () => {
    const storage = createMemoryStorage();
    const progress = { activeStepIndex: 1, completedStepIds: ['a'], checkedItemIds: ['a1', 'a2'] };

    saveProgress(storage, 'key', progress);

    expect(loadProgress(storage, 'key', steps)).toEqual(progress);
  });

  it('falls back to empty progress for missing, corrupt or outdated data', () => {
    const storage = createMemoryStorage({
      corrupt: '{not json',
      outdated: JSON.stringify({ version: 99, progress: { activeStepIndex: 1 } }),
    });

    expect(loadProgress(null, 'key', steps)).toEqual(createEmptyProgress());
    expect(loadProgress(storage, 'missing', steps)).toEqual(createEmptyProgress());
    expect(loadProgress(storage, 'corrupt', steps)).toEqual(createEmptyProgress());
    expect(loadProgress(storage, 'outdated', steps)).toEqual(createEmptyProgress());
  });

  it('does not throw when storage is unavailable', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(() => saveProgress(throwingStorage, 'key', createEmptyProgress())).not.toThrow();
    expect(loadProgress(throwingStorage, 'key', steps)).toEqual(createEmptyProgress());
  });

  it('normalizes stale ids and out-of-range step indexes', () => {
    expect(
      normalizeProgress(
        { activeStepIndex: 42, completedStepIds: ['a', 'gone', 'a', 7], checkedItemIds: ['a1', 'old'] },
        steps,
      ),
    ).toEqual({ activeStepIndex: 1, completedStepIds: ['a'], checkedItemIds: ['a1'] });

    expect(normalizeProgress({ activeStepIndex: -3 }, steps).activeStepIndex).toBe(0);
    expect(normalizeProgress('nope', steps)).toEqual(createEmptyProgress());
  });

  it('clamps navigation to the available steps', () => {
    const progress = createEmptyProgress();

    expect(goToStep(progress, 1, steps.length).activeStepIndex).toBe(1);
    expect(goToStep(progress, 9, steps.length).activeStepIndex).toBe(1);
    expect(goToStep(progress, -1, steps.length).activeStepIndex).toBe(0);
  });

  it('toggles checklist items and un-completes a step when an item is unchecked', () => {
    const [stepA] = steps;
    if (!stepA) throw new Error('missing step');

    let progress = toggleChecklistItem(createEmptyProgress(), stepA, 'a1');
    expect(countCheckedItems(progress, stepA)).toBe(1);

    progress = setStepCompleted(progress, stepA, true);
    expect(isStepCompleted(progress, 'a')).toBe(true);
    expect(countCheckedItems(progress, stepA)).toBe(2);

    progress = toggleChecklistItem(progress, stepA, 'a2');
    expect(isStepCompleted(progress, 'a')).toBe(false);
    expect(countCheckedItems(progress, stepA)).toBe(1);
  });

  it('keeps checklist items when a step is marked not completed', () => {
    const [stepA] = steps;
    if (!stepA) throw new Error('missing step');

    const completed = setStepCompleted(createEmptyProgress(), stepA, true);
    const undone = setStepCompleted(completed, stepA, false);

    expect(isStepCompleted(undone, 'a')).toBe(false);
    expect(undone.checkedItemIds).toEqual(['a1', 'a2']);
  });

  it('reports completion percent and overall completion', () => {
    const [stepA, stepB] = steps;
    if (!stepA || !stepB) throw new Error('missing step');

    let progress = createEmptyProgress();
    expect(getCompletionPercent(progress, steps)).toBe(0);
    expect(isGuideComplete(progress, steps)).toBe(false);

    progress = setStepCompleted(progress, stepA, true);
    expect(getCompletionPercent(progress, steps)).toBe(50);

    progress = setStepCompleted(progress, stepB, true);
    expect(getCompletionPercent(progress, steps)).toBe(100);
    expect(isGuideComplete(progress, steps)).toBe(true);
    expect(isGuideComplete(progress, [])).toBe(false);
  });
});

describe('integration guide content', () => {
  it('defines five steps with unique ids and checklists', () => {
    expect(INTEGRATION_GUIDE_STEPS).toHaveLength(5);

    const stepIds = INTEGRATION_GUIDE_STEPS.map((step) => step.id);
    const itemIds = INTEGRATION_GUIDE_STEPS.flatMap((step) => step.checklist.map((item) => item.id));
    const sectionIds = INTEGRATION_GUIDE_STEPS.flatMap((step) => step.sections.map((section) => section.id));

    expect(new Set(stepIds).size).toBe(stepIds.length);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);

    for (const step of INTEGRATION_GUIDE_STEPS) {
      expect(step.instructions.length).toBeGreaterThan(0);
      expect(step.checklist.length).toBeGreaterThan(0);
    }
  });

  it('uses only the verified Marketplace listing as an external link', () => {
    const serialized = JSON.stringify(INTEGRATION_GUIDE_STEPS);
    const urls = serialized.match(/https?:\/\/[^"\s]+/gu) ?? [];

    expect(OCTOPUS_GHOST_EXTENSION_ID).toBe('octopus-ghost.octopus-ghost');
    expect(OCTOPUS_GHOST_MARKETPLACE_URL).toBe(
      'https://marketplace.visualstudio.com/items?itemName=octopus-ghost.octopus-ghost',
    );
    expect(new Set(urls)).toEqual(new Set([OCTOPUS_GHOST_MARKETPLACE_URL]));
  });

  it('has no manual VSIX installation instructions in any step', () => {
    for (const step of INTEGRATION_GUIDE_STEPS) {
      // Section chips list capture exclusion patterns (e.g. `*.vsix`), which are not install instructions.
      const sections = step.sections.map(({ chips: _chips, ...section }) => section);
      const text = JSON.stringify({ ...step, sections });

      expect(text).not.toMatch(/vsix/iu);
    }
  });
});
