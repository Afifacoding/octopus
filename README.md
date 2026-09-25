# OCTOPUS Foundation

This repository contains the greenfield OCTOPUS project foundation as a modular monorepo.

## Source of truth

- docs/PROJECT_SPECIFICATION.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT_GUIDE.md
- OCTOPUS_UI_UX_Styleguide.html

## Workspace layout

- apps/web: React + Vite frontend foundation
- apps/api: Fastify REST API foundation
- apps/vscode-extension: VS Code extension foundation
- packages/shared: shared contracts and utility types
- database: Prisma configuration and migration directory
- tests: top-level test grouping directories for future phases

## Quick start

1. Install dependencies

```bash
npm install
```

2. Create your environment file

```bash
cp .env.example .env
```

3. Generate Prisma client

```bash
npm run db:generate
```

4. Run services (in separate terminals)

```bash
npm run dev:api
npm run dev:web
```

## Validation commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Notes

- Do not commit real credentials.
- Foundation includes only shared structure and core technical scaffolding.
- Feature modules (auth, OTP, projects, snapshots, vault, restore, AI) are intentionally not implemented yet.
