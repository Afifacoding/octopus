# OCTOPUS VS Code Extension

OCTOPUS is a lightweight VS Code client for capturing a workspace snapshot and sending it directly to the OCTOPUS backend.

## What It Does

The extension is focused on one workflow:

1. Open a project in VS Code.
2. Open OCTOPUS in the Activity Bar.
3. Connect your OCTOPUS account.
4. Select or create an OCTOPUS project.
5. Run Save Snapshot.

The extension captures your workspace, applies generated-file exclusions, creates an archive, and uploads it to OCTOPUS as a project snapshot. Environment files and credential files are included by default so OCTOPUS can detect and import project secrets into Secret Vault.

## What It Does Not Do

This extension does not replace the OCTOPUS web app. Project management, snapshot history, restore, blueprint, and secret vault UX remain in the OCTOPUS web application.

## Installation

When published, install from the VS Code Marketplace by searching for OCTOPUS Ghost.

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
- Default archive upload limit is 30 MiB, coordinated with the current API archive limit.
- octopus.capture.maxFiles
- octopus.capture.maxDirectories
- octopus.capture.maxTotalBytes

Before a Marketplace release, confirm the `octopus-ghost` publisher is registered and the production endpoints are available.

## Security And Privacy Notes

When Save Snapshot runs:

1. Workspace is scanned using capture policy. Generated folders are excluded; credentials are intentionally retained in the snapshot.
2. Excluded paths are skipped.
3. Archive is created in a temporary location.
4. Archive is uploaded to the configured OCTOPUS backend.
5. Temporary archive is cleaned up.

Authentication secrets are stored using VS Code SecretStorage. Snapshot archives are encrypted at rest by the API using the configured vault encryption key; detected Secret Vault values are separately encrypted with AES-256-GCM. Ordinary Vault listings and code previews are masked; authorized users can explicitly unlock and reveal Vault values.

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

Current version is 0.1.1.

## Publishing Preparation

This repository is prepared for future publication only.

Required steps before real publish:

1. Confirm access to the `octopus-ghost` Marketplace publisher.
2. Package and validate the VSIX.
3. Publish using a secure Marketplace credential outside source control.
