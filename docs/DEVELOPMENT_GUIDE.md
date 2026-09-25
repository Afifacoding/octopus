# OCTOPUS - DEVELOPMENT GUIDE

## Purpose

This document defines the practical rules for implementing OCTOPUS.

Use it together with:

```text
PROJECT_SPECIFICATION.md = product requirements
ARCHITECTURE.md           = technical architecture
DEVELOPMENT_GUIDE.md      = implementation rules
```

---

## 1. Development Workflow

Always follow:

```text
Understand
   ↓
Plan
   ↓
Implement
   ↓
Test
   ↓
Review
   ↓
Verify
```

Do not make large unrelated changes in one step.

Build in small, working phases.

---

## 2. Initial Setup

Before implementation:

1. Inspect the repository.
2. Read all documentation.
3. Check installed tools and dependencies.
4. Check existing code before replacing anything.
5. Configure environment variables.
6. Set up the development database.
7. Verify the basic application starts.

Never commit secrets or `.env` files containing real credentials.

---

## 3. Implementation Order

Use this order unless the existing repository requires a justified change:

```text
Phase 1  Repository foundation
Phase 2  Database and migrations
Phase 3  Authentication and email verification
Phase 4  Backend API foundation
Phase 5  Frontend foundation
Phase 6  User/project management
Phase 7  Snapshot engine
Phase 8  Directory tree and blueprint processing
Phase 9  Secret Vault
Phase 10 Restore system
Phase 11 AI integration
Phase 12 VS Code extension
Phase 13 Integration testing
Phase 14 Security testing
Phase 15 Production deployment
```

Each phase must be functional before moving to the next.

---

## 4. Coding Standards

Write code that is:

- Simple
- Readable
- Modular
- Reusable
- Type-safe where applicable
- Secure
- Testable

Rules:

- Avoid duplicated business logic.
- Keep functions focused.
- Validate external input.
- Handle errors explicitly.
- Do not silently swallow exceptions.
- Do not hardcode credentials.
- Do not expose sensitive data in logs.
- Reuse existing utilities/components where appropriate.
- Avoid unnecessary dependencies.

---

## 5. Naming Conventions

Use clear, consistent names.

Examples:

```text
Components: PascalCase
Functions: camelCase
Variables: camelCase
Constants: UPPER_SNAKE_CASE
Database tables: consistent snake_case
API paths: lowercase and resource-oriented
```

Use descriptive names rather than abbreviations that reduce readability.

---

## 6. Project Structure Rules

Keep responsibilities separated.

```text
UI
 ↓
API Client
 ↓
Backend Controller
 ↓
Service
 ↓
Repository
 ↓
Database / Storage
```

Do not put database queries directly inside UI components.

Do not put large business workflows inside controllers.

Do not put backend secrets in frontend code.

---

## 7. Database Development

Use migrations for schema changes.

Rules:

- Never manually modify production schema.
- Use foreign keys where relationships require them.
- Add indexes based on actual query needs.
- Use constraints for data integrity.
- Use transactions for multi-step operations that must be atomic.
- Never store passwords as plain text.
- Never store sensitive secrets unencrypted.

---

## 8. API Development

Every protected endpoint must authenticate the request and authorize resource access.

Before accepting data:

```text
Request
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Business Logic
 ↓
Database / Storage
```

Use consistent success and error responses.

Do not return internal stack traces to users.

---

## 9. Frontend Development

Frontend code should:

- Reuse components.
- Keep API calls in a dedicated API layer.
- Validate forms.
- Show useful loading states.
- Show useful error states.
- Avoid exposing sensitive information.
- Remain responsive.
- Keep business-critical authorization on the backend.

Do not create duplicate versions of the same UI component without a reason.

---

## 10. Snapshot Development Rules

Snapshot processing must:

- Respect ignore rules.
- Preserve relative paths.
- Prevent unsafe paths.
- Validate file/archive input.
- Avoid unnecessary memory usage for large projects.
- Generate deterministic metadata where possible.
- Verify stored snapshots using an integrity mechanism.
- Never include secrets in logs.

ZIP extraction must protect against path traversal and unsafe archive entries.

---

## 11. Secret Handling Rules

Secrets require special treatment.

Never:

```text
console.log(secret)
return secret in normal API response
store secret as plain text
commit secret to Git
send secret to AI unnecessarily
```

Normal project representations should mask sensitive values.

Secret access must be explicitly authorized and audited.

Encryption must use a vetted cryptographic implementation.

Do not invent custom encryption algorithms.

---

## 12. VS Code Extension Development

Keep the extension small.

The extension should primarily:

- Detect workspace
- Apply ignore rules
- Prepare snapshot data
- Communicate with the API
- Show progress
- Request/handle restoration

Do not move backend-only processing into the extension simply to make the extension appear more powerful.

Extension code must handle:

- No workspace
- Large workspace
- Network failure
- Authentication expiration
- Upload failure
- Restore failure
- Cancellation

---

## 13. Testing Strategy

Each implementation phase should include appropriate tests.

### Unit Tests

Test isolated business logic.

### Integration Tests

Test database, storage, and service interactions.

### API Tests

Test:

- Authentication
- Authorization
- Validation
- Success responses
- Error responses

### End-to-End Tests

Test important real workflows from frontend to backend.

### Extension Tests

Test:

- Workspace detection
- Authentication
- Snapshot creation
- Upload
- Restore
- Failure handling

### Security Tests

Test:

- Unauthorized access
- Cross-user access
- Invalid tokens
- Malicious uploads
- ZIP path traversal
- Secret leakage

---

## 14. Code Review Checklist

Before accepting code:

```text
[ ] Requirement implemented
[ ] Architecture followed
[ ] No unnecessary duplication
[ ] Input validated
[ ] Authorization checked
[ ] Errors handled
[ ] Secrets protected
[ ] Tests added/updated
[ ] No debug code
[ ] No hardcoded credentials
[ ] No unnecessary dependencies
[ ] Existing functionality still works
```

---

## 15. Deployment Checklist

Before production:

```text
[ ] Production environment configured
[ ] Secrets stored securely
[ ] Database migrations tested
[ ] Build succeeds
[ ] Tests pass
[ ] HTTPS enabled
[ ] CORS configured correctly
[ ] Rate limiting enabled
[ ] Logging configured
[ ] Monitoring configured
[ ] Backups configured
[ ] Error handling verified
[ ] Snapshot restore tested
[ ] Extension production endpoint configured
```

---

## 16. Git Workflow

Use small, meaningful commits.

Example:

```text
feat: add email OTP verification
feat: add snapshot upload API
fix: prevent unsafe archive extraction
refactor: separate snapshot processing service
test: add project authorization tests
docs: update development guide
```

Avoid commits such as:

```text
update
changes
final
test
new stuff
```

Do not commit:

- `.env`
- credentials
- private keys
- generated secrets
- unnecessary build artifacts

---

## 17. GitHub Copilot Rules

GitHub Copilot must:

1. Read the three documentation files before making architectural changes.
2. Follow `PROJECT_SPECIFICATION.md` for product requirements.
3. Follow `ARCHITECTURE.md` for technical structure.
4. Follow this document for implementation standards.
5. Inspect existing code before creating replacements.
6. Reuse existing functionality where possible.
7. Avoid unnecessary dependencies.
8. Avoid unnecessary architectural complexity.
9. Never invent fake production functionality.
10. Never hardcode secrets.
11. Never expose sensitive information.
12. Implement security together with the feature.
13. Add or update tests for meaningful changes.
14. Keep the VS Code extension lightweight.
15. Keep backend business logic centralized.
16. Preserve compatibility with existing working features.
17. Ask for clarification when a requirement cannot be safely inferred.
18. Do not modify unrelated files.
19. Do not claim a feature is complete unless it has been implemented and verified.
20. Prefer a simple working implementation over an over-engineered implementation.

---

## 18. Definition of Done

A task is complete only when:

```text
Requirement understood
       ↓
Implementation completed
       ↓
Tests completed
       ↓
Security checked
       ↓
Existing functionality verified
       ↓
Errors handled
       ↓
Documentation updated if required
       ↓
Ready for next phase
```

Never mark a feature complete merely because the UI exists. The complete flow must work through the appropriate backend, database, storage, and security layers.
