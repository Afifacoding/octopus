export type CaptureRoot = {
  name: string;
  fsPath: string;
};

export type CapturedFile = {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
};

export type WorkspaceScanResult = {
  files: CapturedFile[];
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
  excludedPaths: string[];
  skippedUnreadablePaths: string[];
};
