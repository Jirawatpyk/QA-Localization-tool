# TD-ARCH-001: File-Scoped Store Refactor CR R1

**Date:** 2026-03-16
**Result:** 0C / 4H / 5M / 8L

## Key Findings

### H1: Shared Mutable DEFAULT_FILE_STATE singleton

- `DEFAULT_FILE_STATE` contains Map/Set instances that could be mutated via `useFileState` fallback
- `createFileState` spreads it but doesn't create fresh undoStack/redoStack arrays

### H2: CommandPalette reads flat field in getState() instead of file-scoped

- `useReviewStore.getState().aiSuggestionsEnabled` in toggle-ai handler = flat field, not file-scoped

### H3: createFileState clears sessionStorage immediately after load = race with React strict mode

- Double-invoke of resetForFile would lose cache on second call

### H4: FileNavigationDropdown saveFilterCache reads flat store fields

- Depends on timing that flat fields still reflect current file before navigation

## New Anti-Pattern Discovered

### 38. Flat Field Access via getState() in File-Scoped Architecture

- After file-scoped migration, `getState().someField` reads the FLAT field (active file only)
- In callbacks/closures that may fire during transitions, flat fields may be stale
- Fix: read from `getState().fileStates.get(fileId)?.field` for guaranteed correctness
- Affected: CommandPalette.tsx:119, FileNavigationDropdown.tsx:65-69, multiple ReviewPageClient callbacks
