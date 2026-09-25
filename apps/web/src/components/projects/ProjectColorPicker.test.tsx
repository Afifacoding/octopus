import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ProjectColorPicker } from './ProjectColorPicker';

describe('ProjectColorPicker', () => {
  it('renders all preset color options and optional no-color action', () => {
    const html = renderToStaticMarkup(
      <ProjectColorPicker value={null} onChange={vi.fn()} idPrefix="create-project" allowClear />,
    );

    expect(html).toContain('Project color (optional)');
    expect(html).toContain('No color');
    expect(html).toContain('Blue');
    expect(html).toContain('Purple');
    expect(html).toContain('Pink');
    expect(html).toContain('Red');
    expect(html).toContain('Orange');
    expect(html).toContain('Yellow');
    expect(html).toContain('Green');
    expect(html).toContain('Teal');
    expect(html).toContain('Cyan');
    expect(html).toContain('Gray');
  });

  it('shows a clear selected state for the active option', () => {
    const html = renderToStaticMarkup(
      <ProjectColorPicker value="TEAL" onChange={vi.fn()} idPrefix="edit-project" allowClear />,
    );

    expect(html).toContain('data-testid="edit-project-color-teal"');
    expect(html).toContain('aria-pressed="true"');
  });
});
