import { describe, expect, it } from 'vitest';

import {
  PROJECT_COLOR_OPTIONS,
  getProjectAccentClass,
  getProjectAccentClasses,
  getProjectCardColorClasses,
} from './project-colors';

describe('project colors', () => {
  it('provides a distinct preset color set', () => {
    expect(PROJECT_COLOR_OPTIONS).toHaveLength(10);
    expect(PROJECT_COLOR_OPTIONS.map((option) => option.value)).toEqual([
      'BLUE',
      'PURPLE',
      'PINK',
      'RED',
      'ORANGE',
      'YELLOW',
      'GREEN',
      'TEAL',
      'CYAN',
      'GRAY',
    ]);
  });

  it('maps selected color to project card accent class', () => {
    expect(getProjectAccentClass('TEAL')).toBe('project-accent-teal');
  });

  it('keeps default appearance when color is not selected', () => {
    expect(getProjectAccentClass(null)).toBe('');
  });

  it('builds all project card classes from a selected color', () => {
    const classes = getProjectCardColorClasses('PURPLE');

    expect(classes.cardClassName).toContain('project-card-accented');
    expect(classes.cardClassName).toContain('project-accent-purple');
    expect(classes.cardClassName).toContain('project-accent-border-purple');
    expect(classes.cardClassName).toContain('project-accent-subtle-purple');
    expect(classes.iconClassName).toContain('project-accent-icon-purple');
    expect(classes.hasColor).toBe(true);
  });

  it('returns normal card classes when project has no selected color', () => {
    const classes = getProjectCardColorClasses(null);

    expect(classes.cardClassName).toBe('project-card project-card-default');
    expect(classes.iconClassName).toBe('project-card-icon');
    expect(classes.hasColor).toBe(false);
  });

  it('builds the same yellow accent classes for OperationBlackbox everywhere it is reused', () => {
    const classes = getProjectAccentClasses('YELLOW');

    expect(classes).toContain('project-card-accented');
    expect(classes).toContain('project-accent-yellow');
    expect(classes).toContain('project-accent-border-yellow');
    expect(classes).toContain('project-accent-subtle-yellow');
  });

  it('produces no accent classes when a project has no assigned color', () => {
    expect(getProjectAccentClasses(null)).toBe('');
    expect(getProjectAccentClasses(undefined)).toBe('');
  });

  it('does not include the list-card flex layout class in the reusable accent', () => {
    const classes = getProjectAccentClasses('PINK');

    expect(classes).not.toContain('project-card ');
    expect(classes).not.toMatch(/^project-card\s/);
  });
});
