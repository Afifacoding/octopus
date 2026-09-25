import type { ProjectColor } from './types';

type ProjectColorStyle = {
  accentClass: string;
  accentBorderClass: string;
  accentSubtleClass: string;
  accentIconClass: string;
};

const PROJECT_COLOR_STYLES: Record<ProjectColor, ProjectColorStyle> = {
  BLUE: {
    accentClass: 'project-accent-blue',
    accentBorderClass: 'project-accent-border-blue',
    accentSubtleClass: 'project-accent-subtle-blue',
    accentIconClass: 'project-accent-icon-blue',
  },
  PURPLE: {
    accentClass: 'project-accent-purple',
    accentBorderClass: 'project-accent-border-purple',
    accentSubtleClass: 'project-accent-subtle-purple',
    accentIconClass: 'project-accent-icon-purple',
  },
  PINK: {
    accentClass: 'project-accent-pink',
    accentBorderClass: 'project-accent-border-pink',
    accentSubtleClass: 'project-accent-subtle-pink',
    accentIconClass: 'project-accent-icon-pink',
  },
  RED: {
    accentClass: 'project-accent-red',
    accentBorderClass: 'project-accent-border-red',
    accentSubtleClass: 'project-accent-subtle-red',
    accentIconClass: 'project-accent-icon-red',
  },
  ORANGE: {
    accentClass: 'project-accent-orange',
    accentBorderClass: 'project-accent-border-orange',
    accentSubtleClass: 'project-accent-subtle-orange',
    accentIconClass: 'project-accent-icon-orange',
  },
  YELLOW: {
    accentClass: 'project-accent-yellow',
    accentBorderClass: 'project-accent-border-yellow',
    accentSubtleClass: 'project-accent-subtle-yellow',
    accentIconClass: 'project-accent-icon-yellow',
  },
  GREEN: {
    accentClass: 'project-accent-green',
    accentBorderClass: 'project-accent-border-green',
    accentSubtleClass: 'project-accent-subtle-green',
    accentIconClass: 'project-accent-icon-green',
  },
  TEAL: {
    accentClass: 'project-accent-teal',
    accentBorderClass: 'project-accent-border-teal',
    accentSubtleClass: 'project-accent-subtle-teal',
    accentIconClass: 'project-accent-icon-teal',
  },
  CYAN: {
    accentClass: 'project-accent-cyan',
    accentBorderClass: 'project-accent-border-cyan',
    accentSubtleClass: 'project-accent-subtle-cyan',
    accentIconClass: 'project-accent-icon-cyan',
  },
  GRAY: {
    accentClass: 'project-accent-gray',
    accentBorderClass: 'project-accent-border-gray',
    accentSubtleClass: 'project-accent-subtle-gray',
    accentIconClass: 'project-accent-icon-gray',
  },
};

export const PROJECT_COLOR_OPTIONS: Array<{ value: ProjectColor; label: string; accentClass: string }> = [
  { value: 'BLUE', label: 'Blue', accentClass: PROJECT_COLOR_STYLES.BLUE.accentClass },
  { value: 'PURPLE', label: 'Purple', accentClass: PROJECT_COLOR_STYLES.PURPLE.accentClass },
  { value: 'PINK', label: 'Pink', accentClass: PROJECT_COLOR_STYLES.PINK.accentClass },
  { value: 'RED', label: 'Red', accentClass: PROJECT_COLOR_STYLES.RED.accentClass },
  { value: 'ORANGE', label: 'Orange', accentClass: PROJECT_COLOR_STYLES.ORANGE.accentClass },
  { value: 'YELLOW', label: 'Yellow', accentClass: PROJECT_COLOR_STYLES.YELLOW.accentClass },
  { value: 'GREEN', label: 'Green', accentClass: PROJECT_COLOR_STYLES.GREEN.accentClass },
  { value: 'TEAL', label: 'Teal', accentClass: PROJECT_COLOR_STYLES.TEAL.accentClass },
  { value: 'CYAN', label: 'Cyan', accentClass: PROJECT_COLOR_STYLES.CYAN.accentClass },
  { value: 'GRAY', label: 'Gray', accentClass: PROJECT_COLOR_STYLES.GRAY.accentClass },
];

export function getProjectAccentClass(color: ProjectColor | null | undefined) {
  if (!color) {
    return '';
  }

  return PROJECT_COLOR_STYLES[color]?.accentClass ?? '';
}

// Same accent treatment used by project list cards, reusable on any Card-based
// section (Project Details header, Snapshot History) without imposing the
// list card's flex/gap layout.
export function getProjectAccentClasses(color: ProjectColor | null | undefined): string {
  if (!color) {
    return '';
  }

  const style = PROJECT_COLOR_STYLES[color];
  if (!style) {
    return '';
  }

  return `project-card-accented ${style.accentClass} ${style.accentBorderClass} ${style.accentSubtleClass}`;
}

export function getProjectCardColorClasses(color: ProjectColor | null | undefined) {
  if (!color) {
    return {
      cardClassName: 'project-card project-card-default',
      iconClassName: 'project-card-icon',
      hasColor: false,
    } as const;
  }

  const style = PROJECT_COLOR_STYLES[color];
  if (!style) {
    return {
      cardClassName: 'project-card project-card-default',
      iconClassName: 'project-card-icon',
      hasColor: false,
    } as const;
  }

  return {
    cardClassName: `project-card project-card-accented ${style.accentClass} ${style.accentBorderClass} ${style.accentSubtleClass}`,
    iconClassName: `project-card-icon ${style.accentClass} ${style.accentIconClass}`,
    hasColor: true,
  } as const;
}
