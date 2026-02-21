---
name: add-feature
description: Scaffold a new feature module with all required directories and boilerplate. Use when the user wants to create a new feature, add a new module, or set up a new domain area in the codebase.
---

# Add Feature Module

Scaffold a new feature module at `src/features/<name>/` following the project's established co-location pattern.

## Arguments

The user provides: `<feature-name>` in kebab-case (e.g., `file-upload`, `report-export`)

## What to Create

Every feature module gets this structure:

```
src/features/<name>/
├── components/          # React components ("use client" boundary lives here)
├── actions/             # Server Actions ({verb}.action.ts)
├── hooks/               # Custom React hooks
├── stores/              # Zustand domain store ({name}.store.ts)
├── validation/          # Zod schemas ({name}Schemas.ts)
└── types.ts             # Feature-specific TypeScript types
```

## Boilerplate Files

### 1. `types.ts` — Feature types

```typescript
// src/features/<name>/types.ts
// Feature-specific types for <Name>

export interface <Name>Data {
  id: string
  tenantId: string
  // TODO: add feature-specific fields
}
```

### 2. `validation/<name>Schemas.ts` — Zod schemas

```typescript
// src/features/<name>/validation/<name>Schemas.ts
import { z } from 'zod'

export const create<Name>Schema = z.object({
  // TODO: add validation fields
})

export type Create<Name>Input = z.infer<typeof create<Name>Schema>
```

## Naming Conventions (MUST follow)

| Element           | Convention           | Example                |
| ----------------- | -------------------- | ---------------------- |
| Feature directory | kebab-case           | `file-upload/`         |
| Components        | PascalCase           | `FileUploadView.tsx`   |
| Server Actions    | `{verb}.action.ts`   | `uploadFile.action.ts` |
| Stores            | `{domain}.store.ts`  | `fileUpload.store.ts`  |
| Types file        | `types.ts`           | `types.ts`             |
| Zod schemas       | `camelCase + Schema` | `fileUploadSchema`     |
| Validation file   | `{name}Schemas.ts`   | `fileUploadSchemas.ts` |

## Rules

- Named exports ONLY (no `export default`)
- `@/` alias for all imports
- NO barrel exports (`index.ts`) in feature modules
- Components that need browser APIs use `'use client'` directive
- Server Actions use `'use server'` + `import 'server-only'`
- All DB queries MUST include `eq(table.tenantId, currentUser.tenantId)` tenant filter

## After Scaffolding

Tell the user:

1. Feature module created at `src/features/<name>/`
2. Next steps: add types to `types.ts`, create server actions with `/add-server-action`, add components
3. If the feature needs a page route, create it at `src/app/(app)/<name>/page.tsx`

## Reference

Existing modules to match patterns against:

- `src/features/dashboard/` — full example (actions, components, hooks, stores, types, validation)
- `src/features/glossary/` — example with extra subdirs (matching, parsers)
- `src/features/taxonomy/` — simpler example
