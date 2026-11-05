import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { INTEGRATION_GUIDE_STEPS, OCTOPUS_GHOST_MARKETPLACE_URL } from '../lib/onboarding/integration-guide-content';
import type { IntegrationGuideProgress } from '../lib/onboarding/integration-guide-progress';
import { IntegrationGuide, renderInline } from './IntegrationGuidePage';

const STORAGE_KEY = 'octopus-integration-guide:test-user';

function storageWith(progress?: IntegrationGuideProgress) {
  const data = new Map<string, string>();
  if (progress) {
    data.set(STORAGE_KEY, JSON.stringify({ version: 1, progress }));
  }

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function render(progress?: IntegrationGuideProgress) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <IntegrationGuide storageKey={STORAGE_KEY} storage={storageWith(progress)} />
    </MemoryRouter>,
  );
}

describe('IntegrationGuide', () => {
  it('renders the heading, subtitle and a five-step progress indicator', () => {
    const html = render();

    expect(html).toContain('Integration Guide');
    expect(html).toContain('Your journey from VS Code to your OCTOPUS dashboard, in five simple steps.');
    expect(html).toContain('aria-label="Integration guide steps"');
    expect(html.match(/class="ig-stepper-button"/gu)).toHaveLength(5);
    for (const step of INTEGRATION_GUIDE_STEPS) {
      expect(html).toContain(step.shortTitle);
    }
    expect(html).toContain('aria-valuenow="0"');
  });

  it('starts on step one with Marketplace install instructions, checklist and navigation', () => {
    const html = render();

    expect(html).toContain('Step 1 of 5');
    expect(html).toContain('Install OCTOPUS Ghost');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Search for <strong>OCTOPUS Ghost</strong>');
    expect(html).toContain('octopus-ghost.octopus-ghost');
    expect(html).toContain('I found OCTOPUS Ghost on the VS Code Marketplace.');
    expect(html).toContain('I installed the extension.');
    expect(html).toContain('I can see OCTOPUS in the Activity Bar.');
    expect(html).not.toMatch(/vsix/iu);
    expect(html).toContain('Checklist');
    expect(html).toContain('Mark step as completed');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Previous/u);
    expect(html).toContain('Next');
  });

  it('links only to the verified Marketplace listing, opening it safely in a new tab', () => {
    const html = render();
    const externalLinks = html.match(/href="https?:[^"]*"/gu) ?? [];

    expect(externalLinks).toEqual([`href="${OCTOPUS_GHOST_MARKETPLACE_URL.replace(/&/gu, '&amp;')}"`]);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('restores the saved step and checked items from storage', () => {
    const html = render({
      activeStepIndex: 3,
      completedStepIds: ['install-extension', 'connect-account', 'select-project'],
      checkedItemIds: ['snapshot-started'],
    });

    expect(html).toContain('Step 4 of 5');
    expect(html).toContain('Save Your First Snapshot');
    expect(html).toContain('1/3');
    expect(html).toContain('aria-valuenow="60"');
    expect(html).toContain('3 of 5 steps completed');
    expect(html).toContain('Secret Vault');
  });

  it('offers Back to Dashboard on the final step until every step is complete', () => {
    const html = render({ activeStepIndex: 4, completedStepIds: [], checkedItemIds: [] });

    expect(html).toContain('Step 5 of 5');
    expect(html).toContain('Back to Dashboard');
    expect(html).toContain('href="/"');
  });

  it('shows the completion state once all steps are completed', () => {
    const html = render({
      activeStepIndex: 4,
      completedStepIds: INTEGRATION_GUIDE_STEPS.map((step) => step.id),
      checkedItemIds: [],
    });

    expect(html).toContain('You&#x27;re all set! Your OCTOPUS workflow is ready.');
    expect(html).toContain('Return to Dashboard');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/projects"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).not.toContain('Mark step as completed');
  });

  it('renders without storage access', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <IntegrationGuide storageKey={STORAGE_KEY} storage={null} />
      </MemoryRouter>,
    );

    expect(html).toContain('Step 1 of 5');
  });
});

describe('renderInline', () => {
  it('formats inline code and bold markers', () => {
    const html = renderToStaticMarkup(<p>{renderInline('Run `npm test` then **save**.')}</p>);

    expect(html).toBe('<p>Run <code class="ig-code">npm test</code> then <strong>save</strong>.</p>');
  });
});
