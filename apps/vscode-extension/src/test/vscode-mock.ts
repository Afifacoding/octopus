export const workspace = {
  workspaceFolders: [],
  getConfiguration: () => ({
    get: (_key: string, fallback: unknown) => fallback,
  }),
};

export const window = {
  showInputBox: async () => undefined,
  showQuickPick: async () => undefined,
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  withProgress: async (
    _options: unknown,
    task: (progress: { report: (_value: { message?: string }) => void }, token: { isCancellationRequested: boolean }) => Promise<void>,
  ) => task({ report: () => undefined }, { isCancellationRequested: false }),
};

export const env = {
  openExternal: async () => true,
};

export const ProgressLocation = {
  Notification: 1,
};

export const Uri = {
  parse: (value: string) => ({ value }),
};
