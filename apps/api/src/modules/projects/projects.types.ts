export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

export type ProjectColor =
  | 'BLUE'
  | 'PURPLE'
  | 'PINK'
  | 'RED'
  | 'ORANGE'
  | 'YELLOW'
  | 'GREEN'
  | 'TEAL'
  | 'CYAN'
  | 'GRAY';

export type PublicProject = {
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
