import { describe, expect, it } from 'vitest';

import { buildCreateProjectInput, buildUpdateProjectInput, resolveEditProjectColor } from './project-form';

describe('project form helpers', () => {
  it('submits selected color in create payload', () => {
    const payload = buildCreateProjectInput({
      name: 'Demo',
      description: 'Testing',
      color: 'ORANGE',
    });

    expect(payload).toMatchObject({
      name: 'Demo',
      description: 'Testing',
      color: 'ORANGE',
    });
  });

  it('omits color in create payload when not selected', () => {
    const payload = buildCreateProjectInput({
      name: 'Demo',
      description: ' ',
      color: null,
    });

    expect(payload).toEqual({
      name: 'Demo',
    });
  });

  it('loads existing selected color in edit flow', () => {
    expect(resolveEditProjectColor('CYAN')).toBe('CYAN');
  });

  it('supports clearing project color in edit payload', () => {
    const payload = buildUpdateProjectInput({
      name: 'Demo',
      description: 'Updated',
      color: null,
    });

    expect(payload).toEqual({
      name: 'Demo',
      description: 'Updated',
      color: null,
    });
  });
});
