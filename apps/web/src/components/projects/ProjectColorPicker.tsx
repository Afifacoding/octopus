import type { ProjectColor } from '../../lib/projects/types';
import { PROJECT_COLOR_OPTIONS } from '../../lib/projects/project-colors';

type ProjectColorPickerProps = {
  value: ProjectColor | null;
  onChange: (nextColor: ProjectColor | null) => void;
  allowClear?: boolean;
  idPrefix: string;
};

export function ProjectColorPicker({ value, onChange, allowClear = true, idPrefix }: ProjectColorPickerProps) {
  return (
    <fieldset className="project-color-picker" aria-label="Project color">
      <legend className="eyebrow">Project color (optional)</legend>
      <div className="project-color-options">
        {allowClear ? (
          <button
            type="button"
            className={`project-color-chip ${value === null ? 'project-color-chip-selected' : ''}`}
            onClick={() => onChange(null)}
            data-testid={`${idPrefix}-color-none`}
            aria-pressed={value === null}
          >
            No color
          </button>
        ) : null}

        {PROJECT_COLOR_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`project-color-chip ${isSelected ? 'project-color-chip-selected' : ''}`}
              onClick={() => onChange(option.value)}
              data-testid={`${idPrefix}-color-${option.value.toLowerCase()}`}
              aria-pressed={isSelected}
            >
              <span className={`project-color-dot ${option.accentClass}`} aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
