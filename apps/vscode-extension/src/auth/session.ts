import type * as vscode from 'vscode';

const SECRET_KEY = 'octopus.sessionCookie';

function getSecretStorage(context: vscode.ExtensionContext) {
  return (context as unknown as {
    secrets: {
      store: (key: string, value: string) => Thenable<void>;
      delete: (key: string) => Thenable<void>;
      get: (key: string) => Thenable<string | undefined>;
    };
  }).secrets;
}

export async function saveSessionCookie(context: vscode.ExtensionContext, cookieHeader: string) {
  await getSecretStorage(context).store(SECRET_KEY, cookieHeader);
}

export async function clearSessionCookie(context: vscode.ExtensionContext) {
  await getSecretStorage(context).delete(SECRET_KEY);
}

export async function getSessionCookie(context: vscode.ExtensionContext) {
  return getSecretStorage(context).get(SECRET_KEY);
}
