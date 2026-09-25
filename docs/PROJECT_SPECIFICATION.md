# OCTOPUS - PROJECT SPECIFICATION

## 1. Project Overview

OCTOPUS is a developer platform for securely capturing, storing, understanding, and restoring complete software projects.

The platform combines a web application with a lightweight VS Code extension. The extension provides one-click project capture from a local VS Code workspace, while the web application provides project management, snapshots, directory exploration, blueprints, secret management, AI assistance, and restoration.

The platform is designed around secure project ownership, reliable project snapshots, lightweight client-side processing, and centralized backend processing.

---

## 2. Core Product Principles

- One user profile owns and manages that user's projects.
- Email ownership must be verified during registration.
- Project data must be isolated between users.
- The VS Code extension must provide a simple one-click capture experience.
- The extension should remain lightweight.
- Heavy processing should remain on the backend.
- Project structure must be preserved.
- Sensitive values must be masked in normal code views.
- Real secrets must be protected separately.
- Snapshots must be verifiable and restorable.
- The system should prefer simple, maintainable solutions over unnecessary complexity.

---

## 3. User Account

Each person has one OCTOPUS profile.

The profile is associated with:

- Username
- Email
- Password/authentication credentials
- Verification status
- Projects
- Snapshots
- Settings
- Extension connection

### Email Verification

During signup:

1. User enters username, Gmail address, and password.
2. OCTOPUS sends a one-time OTP to the provided email.
3. User enters the OTP.
4. Email ownership is verified.
5. Account access is enabled.

The system should not treat an unverified account as fully active.

---

## 4. Project Management

Users can manage their own projects.

A project can contain:

- Project name
- Description
- Project metadata
- Snapshots
- Blueprint information
- Directory tree
- Stored project files
- Secret metadata
- Restore history

All project resources must belong to the authenticated owner.

---

## 5. Snapshot System

A snapshot represents a captured version of a complete project.

The capture should preserve:

- Root project folder
- Frontend
- Backend
- Database-related project files
- APIs
- Configuration files where appropriate
- Nested directories
- Source files
- Project metadata

The system should automatically generate snapshot metadata such as:

- Version
- Timestamp
- Integrity hash
- Project association

Unnecessary/generated directories such as `node_modules`, build output, and `.git` should be excluded according to configurable ignore rules.

---

## 6. Direct VS Code Capture

The intended experience is:

```text
Open project in VS Code
        |
        v
Click OCTOPUS extension icon
        |
        v
Detect workspace
        |
        v
Apply ignore rules
        |
        v
Collect project structure/files
        |
        v
Create snapshot package
        |
        v
Secure upload to OCTOPUS
        |
        v
Backend processes snapshot
        |
        v
Project appears in OCTOPUS
```

The user should not need to manually create a ZIP and upload it through the web application.

---

## 7. Directory Tree

Each saved project must expose its directory structure.

Example:

```text
octopus/
├── src/
│   ├── components/
│   └── App.js
├── server/
│   └── index.js
└── package.json
```

The web application should provide a Directory column/view showing the hierarchy from the project root.

---

## 8. Project Blueprint

OCTOPUS generates project metadata describing the detected technical structure.

The blueprint can include:

- Frontend technology
- Backend technology
- Database technology
- Programming languages
- Frameworks
- Package managers
- APIs
- Environment/configuration information
- Architecture metadata

Blueprint generation should be based on actual project contents rather than fabricated information.

---

## 9. Secret Management

Sensitive project values must be protected.

Typical sensitive values include:

- API keys
- Passwords
- Tokens
- Database credentials
- Private secrets

### Normal Code View

Sensitive values should appear masked:

```js
const API_KEY = "****";
const DB_PASSWORD = "****";
```

### Secret Vault

Actual secret values are stored separately from the normal code representation.

The Secret Vault requires protected access using the user's master secret/password mechanism.

Secrets must be encrypted at rest.

Plain-text secrets must not be exposed in:

- Normal code views
- Logs
- Error messages
- Unprotected API responses
- AI context

---

## 10. Restore

Users can select a previous snapshot and restore it.

The restore process should:

1. Identify the selected snapshot.
2. Verify snapshot integrity.
3. Retrieve the stored project package.
4. Restore the project structure and files.
5. Restore associated protected secret information according to authorization.
6. Record the restore operation.

---

## 11. AI - OctoHelp

OctoHelp is the project's AI assistance layer.

It should help users understand their saved projects by using appropriate project context such as:

- Blueprint metadata
- Directory tree
- Snapshot metadata
- Project technologies
- File relationships

It should be treated as a project-understanding assistant.

It must respect authorization and must not expose protected secrets.

It should not modify project data automatically without explicit user action.

---

## 12. Web Application

The web application provides the central interface for OCTOPUS.

It includes areas for:

- Signup/login
- User profile
- Dashboard
- Project management
- Snapshot history
- Project exploration
- Directory tree
- Blueprint information
- Secret Vault
- Restore
- AI assistance
- Settings
- Extension connection/status

The detailed technical implementation is defined in `ARCHITECTURE.md` and `DEVELOPMENT_GUIDE.md`.

---

## 13. VS Code Extension

The VS Code extension is a lightweight client connected to the OCTOPUS backend.

It is responsible for:

- User authentication
- Workspace detection
- Applying ignore rules
- Preparing a project snapshot
- Uploading the snapshot
- Requesting/receiving restore operations
- Showing operation status

Heavy analysis and processing should remain on the backend wherever practical.

The architecture must leave clear space for the extension from the beginning rather than adding it as a late integration.

---

## 14. Security Requirements

Security is required throughout the system.

The implementation must include appropriate controls for:

- Password protection
- Email verification
- Authentication
- Authorization
- User data isolation
- Secret encryption
- Secure file uploads
- Safe ZIP handling
- Path traversal prevention
- Input validation
- Rate limiting
- Secure configuration
- Safe logging
- HTTPS in production

Every user-specific resource must be authorized on the backend.

---

## 15. Non-Functional Requirements

### Security
User projects and secrets must remain protected.

### Performance
The extension should remain lightweight and snapshot processing should be efficient.

### Reliability
Snapshots must remain intact and restoration must be dependable.

### Maintainability
The codebase should use modular, reusable, understandable code.

### Scalability
The architecture should support increasing users, projects, and snapshots without unnecessary redesign.

### Usability
The primary capture workflow should be simple:

```text
Open project -> Click extension -> Save
```

---

## 16. Future Direction

Potential future extensions include:

- Team collaboration
- Organization workspaces
- Role-based permissions
- CLI
- Desktop application
- Browser extension
- Additional IDE integrations
- Advanced AI project analysis
- Enterprise features

Future functionality must not unnecessarily complicate the initial production implementation.

---

## 17. Source of Truth

This document defines the product requirements and expected behavior.

Use:

```text
PROJECT_SPECIFICATION.md
    = What OCTOPUS must be

ARCHITECTURE.md
    = How OCTOPUS is technically structured

DEVELOPMENT_GUIDE.md
    = How OCTOPUS must be implemented
```

The documents should complement each other and avoid duplicating the same information.
