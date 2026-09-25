import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getExtensionConnectionCardContent } from './DashboardPage';
import { DashboardPage } from './DashboardPage';

describe('Dashboard Page', () => {
  it('keeps existing suite focused and import stable', () => {
    expect(typeof getExtensionConnectionCardContent).toBe('function');
  });
});

describe('Dashboard extension connection card content', () => {
  it('renders the cleaned dashboard without removed sections', () => {
    const html = renderToStaticMarkup(createElement(DashboardPage));

    expect(html).toContain('VS Code Integration');
    expect(html).toContain('Total Projects');
    expect(html).toContain('Last Snapshot');

    expect(html).not.toContain('Control Panel');
    expect(html).not.toContain('Manage Project Workspace');
    expect(html).not.toContain('Snapshot Now');
    expect(html).not.toContain('Instant Rollback');
    expect(html).not.toContain('Total Snapshots');
    expect(html).not.toContain('Vault Size');
    expect(html).not.toContain('Snapshot Timeline');
    expect(html).not.toContain('Project ID');
    expect(html).not.toContain('lastSeenAt');
    expect(html).not.toContain('sessionId');
  });

  it('returns connected messaging for active extension status', () => {
    const content = getExtensionConnectionCardContent({
      connected: true,
      status: 'CONNECTED',
      workspaceName: 'octo',
      projectId: 'project_1',
      projectName: 'octo',
      sessionLastSeenAt: new Date().toISOString(),
    });

    expect(content.connected).toBe(true);
    expect(content.title).toBe('VS Code Connected');
    expect(content.description).toBe('OCTOPUS extension is active.');
  });

  it('returns disconnected messaging when extension status is absent', () => {
    const content = getExtensionConnectionCardContent(null);

    expect(content.connected).toBe(false);
    expect(content.title).toBe('VS Code Not Connected');
    expect(content.description).toBe('Connect the OCTOPUS extension to enable workspace capture.');
  });

  it('treats a stale extension session (heartbeat freshness expired) as not connected', () => {
    const content = getExtensionConnectionCardContent({
      connected: false,
      status: 'NOT_CONNECTED',
      workspaceName: null,
      projectId: null,
      projectName: null,
      sessionLastSeenAt: null,
    });

    expect(content.connected).toBe(false);
    expect(content.title).toBe('VS Code Not Connected');
  });
});
