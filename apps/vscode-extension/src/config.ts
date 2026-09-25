import * as vscode from 'vscode';

const CONFIG_SECTION = 'octopus';
type OctopusEnvironment = 'development' | 'production' | 'custom';

function getEnvironment() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<OctopusEnvironment>('environment', 'development');
}

export function getApiBaseUrl() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const environment = getEnvironment();

  if (environment === 'production') {
    return config.get<string>(
      'productionApiBaseUrl',
      'https://OCTOPUS_API_BASE_URL_PLACEHOLDER/api/v1',
    );
  }

  if (environment === 'custom') {
    return config.get<string>('apiBaseUrl', 'http://localhost:4000/api/v1');
  }

  return config.get<string>('developmentApiBaseUrl', 'http://localhost:4000/api/v1');
}

export function getWebBaseUrl() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const environment = getEnvironment();

  if (environment === 'production') {
    return config.get<string>('productionWebBaseUrl', 'https://OCTOPUS_WEB_BASE_URL_PLACEHOLDER');
  }

  if (environment === 'custom') {
    return config.get<string>('webBaseUrl', 'http://localhost:5173');
  }

  return config.get<string>('developmentWebBaseUrl', 'http://localhost:5173');
}

export function getCaptureExcludePatterns() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string[]>('capture.excludePatterns', []);
}

export function getCaptureExcludeSensitiveFiles() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>('capture.excludeSensitiveFiles', true);
}

export function getCaptureAnalyzeSecrets() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>('capture.analyzeSecrets', true);
}

export function getCaptureMaxUploadBytes() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('capture.maxUploadBytes', 700000);
}

export function getCaptureMaxFiles() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('capture.maxFiles', 50000);
}

export function getCaptureMaxDirectories() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('capture.maxDirectories', 10000);
}

export function getCaptureMaxTotalBytes() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('capture.maxTotalBytes', 150000000);
}

export function getRequestTimeoutMs() {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('requestTimeoutMs', 45000);
}
