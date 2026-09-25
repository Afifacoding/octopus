import type { Project } from './api/projects';

export type ExtensionViewState = {
  connectedUser: string | null;
  selectedProject: Project | null;
  lastCaptureSummary: string | null;
  exclusionPreview: string[];
};

export function createInitialViewState(): ExtensionViewState {
  return {
    connectedUser: null,
    selectedProject: null,
    lastCaptureSummary: null,
    exclusionPreview: [],
  };
}
