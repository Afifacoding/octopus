export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

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

export type Project = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  color: ProjectColor | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ProjectListResponse = {
  projects: Project[];
};
