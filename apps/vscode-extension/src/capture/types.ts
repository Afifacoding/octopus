export type CaptureRoot = {
  name: string;
  fsPath: string;
};

export type CapturedFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
};

export type CaptureEntry = {
  path: string;
  type: 'FILE' | 'DIRECTORY';
};

export type WorkspaceScanResult = {
  files: CapturedFile[];
  entries: CaptureEntry[];
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
  excludedPaths: string[];
  skippedUnreadablePaths: string[];
};
