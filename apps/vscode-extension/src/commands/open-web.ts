import * as vscode from 'vscode';

import { getWebBaseUrl } from '../config';

export async function openOctopusWeb() {
  await vscode.env.openExternal(vscode.Uri.parse(getWebBaseUrl()));
}
