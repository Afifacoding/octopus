export const PROJECT_COLORS = [
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
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];
