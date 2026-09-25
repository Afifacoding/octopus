# OCTOPUS VS Code Extension

OCTOPUS is a lightweight VS Code client for capturing a workspace snapshot and sending it directly to the OCTOPUS backend.

## What It Does

The extension is focused on one workflow:

1. Open a project in VS Code.
2. Open OCTOPUS in the Activity Bar.
3. Connect your OCTOPUS account.
4. Select or create an OCTOPUS project.
5. Run Save Snapshot.

The extension captures your workspace, applies exclusions, creates an archive, and uploads it to OCTOPUS as a project snapshot.

## What It Does Not Do

This extension does not replace the OCTOPUS web app. Project management, snapshot history, restore, blueprint, and secret vault UX remain in the OCTOPUS web application.

## Installation

When published, install from the VS Code Marketplace by searching for OCTOPUS.

For local development:

1. Install dependencies at repository root.
2. Build extension with npm run build -w octopus-vscode-extension.
3. Start Extension Development Host from VS Code.

## Commands

- OCTOPUS: Save Snapshot
- OCTOPUS: Connect Account
- OCTOPUS: Select Project
- OCTOPUS: Open Web App
- OCTOPUS: Open Control Panel

## Workspace Support

- Single-root workspaces are supported.
- Multi-root workspaces are supported and root names are preserved in captured paths.
- If no workspace is open, the extension shows a safe message and does not crash.

## Configuration

The extension settings are under octopus:

- octopus.environment: development, production, or custom
- octopus.developmentApiBaseUrl
- octopus.productionApiBaseUrl
- octopus.apiBaseUrl (used for custom environment)
- octopus.developmentWebBaseUrl
- octopus.productionWebBaseUrl
- octopus.webBaseUrl (used for custom environment)
- octopus.requestTimeoutMs
- octopus.capture.excludeSensitiveFiles
- octopus.capture.excludePatterns
- octopus.capture.maxUploadBytes
- octopus.capture.maxFiles
- octopus.capture.maxDirectories
- octopus.capture.maxTotalBytes

Before Marketplace publication, replace production URL placeholders with real OCTOPUS production endpoints.

## Security And Privacy Notes

When Save Snapshot runs:

1. Workspace is scanned using capture policy.
2. Excluded paths are skipped.
3. Archive is created in a temporary location.
4. Archive is uploaded to the configured OCTOPUS backend.
5. Temporary archive is cleaned up.

Authentication secrets are stored using VS Code SecretStorage.

The full OCTOPUS Secret Vault and advanced masking workflow are not implemented in this extension phase.

## Development Commands

- npm run lint -w octopus-vscode-extension
- npm run typecheck -w octopus-vscode-extension
- npm run test -w octopus-vscode-extension
- npm run build -w octopus-vscode-extension
- npm run package:vsix -w octopus-vscode-extension

## Versioning

This extension follows semantic versioning.

- Patch: fixes and internal improvements
- Minor: backward-compatible user-visible features
- Major: breaking changes

Current version remains 0.1.0.

## Publishing Preparation

This repository is prepared for future publication only.

Required steps before real publish:

1. Create a Visual Studio Marketplace publisher account.
2. Replace OCTOPUS_PUBLISHER_PLACEHOLDER in extension manifest.
3. Replace production API and web URL placeholders.
4. Package and validate VSIX.
5. Publish with a secure Marketplace PAT outside source control.
