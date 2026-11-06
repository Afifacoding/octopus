export const ASSISTANT_PAGE_CONTEXTS = [
  'DASHBOARD',
  'PROJECTS',
  'PROJECT_DETAILS',
  'SNAPSHOT',
  'BLUEPRINT',
  'SECRET_VAULT',
  'SETTINGS',
] as const;

export type OctoPageContext = (typeof ASSISTANT_PAGE_CONTEXTS)[number];
