import { describe, expect, it } from 'vitest';

import { filterProjectsByQuery, resolveProjectCardClasses } from './ProjectsPage';
import type { Project } from '../lib/projects/types';

function project(overrides: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    ownerId: 'user_1',
    description: null,
    color: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

describe('filterProjectsByQuery', () => {
  const projects = [
    project({ id: '1', name: 'env2', description: 'Environment sandbox' }),
    project({ id: '2', name: 'env demo', description: 'Demo workspace' }),
    project({ id: '3', name: 'Source Control', description: 'Version tracking' }),
    project({ id: '4', name: 'Secrets Rotation', description: 'Handles security keys' }),
  ];

  it('returns every project when the query is empty', () => {
    expect(filterProjectsByQuery(projects, '')).toEqual(projects);
    expect(filterProjectsByQuery(projects, '   ')).toEqual(projects);
  });

  it('matches partial substrings in the project name', () => {
    const results = filterProjectsByQuery(projects, 'env');
    expect(results.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('is case-insensitive', () => {
    const results = filterProjectsByQuery(projects, 'SOURCE');
    expect(results.map((item) => item.id)).toEqual(['3']);
  });

  it('matches partial letters anywhere in name or description', () => {
    const results = filterProjectsByQuery(projects, 'sec');
    expect(results.map((item) => item.id)).toEqual(['4']);
  });

  it('matches on description as well as name', () => {
    const results = filterProjectsByQuery(projects, 'workspace');
    expect(results.map((item) => item.id)).toEqual(['2']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterProjectsByQuery(projects, 'nonexistent')).toEqual([]);
  });

  it('treats a null description as an empty string rather than throwing', () => {
    const noDescription = [project({ id: '5', name: 'No Description Project', description: null })];
    expect(filterProjectsByQuery(noDescription, 'no description')).toHaveLength(1);
  });
});

describe('ProjectsPage project color runtime mapping', () => {
  it('maps project.color=BLUE to accent card classes', () => {
    const classes = resolveProjectCardClasses({ color: 'BLUE' });

    expect(classes.hasColor).toBe(true);
    expect(classes.cardClassName).toContain('project-card-accented');
    expect(classes.cardClassName).toContain('project-accent-blue');
    expect(classes.cardClassName).toContain('project-accent-border-blue');
    expect(classes.iconClassName).toContain('project-accent-icon-blue');
  });

  it('maps project.color=null to default card classes', () => {
    const classes = resolveProjectCardClasses({ color: null });

    expect(classes.hasColor).toBe(false);
    expect(classes.cardClassName).toBe('project-card project-card-default');
    expect(classes.iconClassName).toBe('project-card-icon');
  });
});
