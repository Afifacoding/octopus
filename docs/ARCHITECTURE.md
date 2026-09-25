# OCTOPUS - ARCHITECTURE

## Purpose

This document defines the technical structure of OCTOPUS.

`PROJECT_SPECIFICATION.md` defines product requirements. This document defines how the software is structured and how its components communicate.

---

## 1. System Architecture

OCTOPUS uses a client-server architecture.

```text
+---------------------+
| Web Application     |
+----------+----------+
           |
           | HTTPS / REST
           v
+---------------------+
| Backend API         |
+----+-------+--------+
     |       |
     |       +------------------+
     |                          |
     v                          v
+------------+          +---------------+
| PostgreSQL |          | Object        |
|            |          | Storage       |
+------------+          +---------------+
```

The VS Code extension is another client:

```text
VS Code Extension
       |
       | HTTPS / REST
       v
   Backend API
       |
       +---- PostgreSQL
       |
       +---- Object Storage
```

The backend is the central authority for authentication, authorization, processing, and storage operations.

---

## 2. Repository Structure

Recommended structure:

```text
octopus/
├── apps/
│   ├── web/
│   ├── backend/
│   └── vscode-extension/
│
├── packages/
│   ├── shared/
│   ├── types/
│   ├── validation/
│   └── ui/
│
├── docs/
├── scripts/
├── .github/
├── package.json
└── README.md
```

`apps/` contains deployable applications.

`packages/` contains reusable code shared between applications.

`docs/` contains project documentation.

`scripts/` contains development/maintenance scripts.

`.github/` contains repository automation and CI configuration.

---

## 3. Frontend Architecture

The web frontend is responsible for presentation and client-side interaction.

```text
Pages / Routes
      |
      v
UI Components
      |
      v
State Management
      |
      v
API Client
      |
      v
Backend API
```

Frontend responsibilities:

- Rendering UI
- Navigation
- Form handling
- Client-side validation
- Displaying API results
- Managing temporary UI state

Business-critical authorization and security decisions must remain on the backend.

---

## 4. Backend Architecture

The backend should use a layered structure:

```text
HTTP Request
     |
     v
Middleware
     |
     v
Controller
     |
     v
Service
     |
     v
Repository / Storage
     |
     v
Database / Object Storage
```

### Controllers
Handle HTTP requests and responses.

### Services
Contain business logic.

### Repositories
Handle database access.

### Middleware
Handles cross-cutting concerns such as authentication, authorization, validation, rate limiting, and logging.

---

## 5. Database Architecture

PostgreSQL is the primary structured data store.

It stores metadata and relationships rather than large snapshot archives.

Core relationships:

```text
User
 |
 +---- Projects
          |
          +---- Snapshots
          |
          +---- Blueprint Metadata
          |
          +---- Directory Metadata
          |
          +---- Restore History
```

Secrets must have protected storage and must never be stored as plain text.

Use:

- Primary keys
- Foreign keys
- Appropriate indexes
- Constraints
- Transactions where required
- Database migrations

---

## 6. Storage Architecture

Large project archives should be stored in object storage rather than directly in PostgreSQL.

```text
Project
   |
   +---- Snapshot Metadata -> PostgreSQL
   |
   +---- Snapshot Archive -> Object Storage
```

Object storage can contain:

```text
projects/
  {user-id}/
    {project-id}/
      snapshots/
        {snapshot-id}/
          project archive
          manifest
          related artifacts
```

Actual provider-specific configuration belongs in deployment configuration.

---

## 7. Authentication Architecture

Authentication uses:

```text
Signup
  |
  v
Email OTP
  |
  v
Verified Account
  |
  v
Login
  |
  v
Access Token / Session
  |
  v
Protected API
```

The backend must validate authentication on protected requests.

Passwords must be securely hashed.

Tokens/sessions must be handled securely and must support expiration and revocation where required.

---

## 8. Authorization Architecture

Authentication answers:

> Who is this user?

Authorization answers:

> Is this user allowed to access this resource?

Every protected resource must be checked against the authenticated user's ownership/permissions.

Example:

```text
Request
  |
  v
Authenticate user
  |
  v
Identify resource
  |
  v
Check ownership/permission
  |
  +---- denied -> 403
  |
  v
Continue
```

Frontend-only access checks are not sufficient.

---

## 9. API Architecture

Use versioned REST APIs.

Example:

```text
/api/v1/...
```

Requests should follow consistent conventions for:

- Authentication
- Validation
- JSON responses
- Errors
- Pagination
- Resource identifiers

Standard error shape:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

API implementation details and endpoint contracts belong in `DEVELOPMENT_GUIDE.md`.

---

## 10. VS Code Extension Architecture

The extension should remain lightweight.

```text
VS Code
  |
  v
Extension Commands
  |
  +---- Authentication
  |
  +---- Workspace Scanner
  |
  +---- Snapshot Builder
  |
  +---- API Client
  |
  +---- Restore Handler
```

The extension should not duplicate backend business logic.

Its main responsibilities are:

- Detect workspace
- Apply local ignore rules
- Prepare project data
- Communicate with the backend
- Show progress/status
- Handle restore operations

Heavy analysis should be performed by backend services.

---

## 11. Snapshot Processing Pipeline

```text
VS Code Workspace
       |
       v
Ignore Rules
       |
       v
Workspace Scan
       |
       v
Manifest Generation
       |
       v
Archive / Upload
       |
       v
Backend Validation
       |
       v
Snapshot Storage
       |
       +----> Directory Tree
       |
       +----> Blueprint Analysis
       |
       +----> Secret Detection
       |
       v
Metadata Stored
```

The backend should validate uploads before processing them.

---

## 12. Secret Vault Architecture

The secret pipeline is:

```text
Project Input
     |
     v
Secret Detection
     |
     v
Extract Sensitive Value
     |
     +----> Masked Project Representation
     |
     v
Encrypt Secret
     |
     v
Protected Storage
```

When a secret is requested:

```text
User
 |
 v
Secret Vault
 |
 v
Authentication / Master Password verification
 |
 v
Authorization
 |
 v
Decrypt
 |
 v
Temporarily display secret
```

Plain-text secrets must not appear in normal project views or logs.

Encryption keys must not be stored together with encrypted data in an insecure manner.

---

## 13. AI Architecture

OctoHelp should receive controlled project context.

```text
Project Metadata
      |
Directory Metadata
      |
Blueprint Metadata
      |
Snapshot Metadata
      |
      v
Context Builder
      |
      v
AI Service
      |
      v
Response
```

The AI context layer must enforce authorization and must exclude protected secrets unless explicitly authorized by a future security design.

AI responses should distinguish project-derived information from generated explanations where necessary.

---

## 14. Deployment Architecture

Production structure:

```text
User
 |
 v
Web Frontend
 |
 v
HTTPS / API
 |
 v
Backend
 |
 +---- PostgreSQL
 |
 +---- Object Storage
 |
 +---- Email Provider
 |
 +---- AI Provider
```

The VS Code extension communicates with the same backend API.

Deployment should support:

- Environment-based configuration
- HTTPS
- Database migrations
- CI/CD
- Logging
- Monitoring
- Backups

---

## 15. Technical Decisions

### Thin Extension

Heavy processing stays on the backend to keep the VS Code extension small and easier to maintain.

### PostgreSQL

Use a relational database for structured user/project/snapshot metadata and relationships.

### Object Storage

Use object storage for large project archives instead of putting binary archives into database rows.

### REST API

Use a consistent REST API so the web application and VS Code extension can share the same backend.

### Layered Backend

Separate controllers, services, repositories, and middleware so business logic is reusable and testable.

### Modular Monolith First

Keep the initial backend as a modular application rather than splitting into microservices prematurely. Extract services only when real scale or operational requirements justify it.
