# Project Rules

This repository is built to be readable, scalable, and safe to modify by both humans and AI agents.

If you contribute to this project, follow these rules strictly.

## 0. Goals

- Minimal, clean architecture that scales.
- Fast feedback loops: tests, types, lint.
- Deterministic behavior: pure domain logic, stable data shapes.
- Real-time collaboration with correctness over cleverness.
- Performance: smooth UI, safe concurrency, predictable persistence.

## 1. Non-negotiables

- Pure domain logic lives in packages and is unit-tested.
- No "magic" abstractions. Prefer explicit and boring.
- No cross-layer imports:
  - apps must not import from each other
  - apps may only import from packages
- Every protocol message is typed and validated at boundaries.
- Any new feature must include acceptance criteria and tests.
## TypeScript enforcement

- All source code files MUST be TypeScript:
  - apps/web: `.ts`, `.tsx`
  - apps/api: `.ts`
  - packages/*: `.ts`
- Do not add `.js` or `.jsx` source files.
- Config files may be `.js` only when required by tooling, but prefer `.ts` where supported.
- All workspaces must pass `pnpm -r typecheck`.
- TS strict mode MUST be enabled in all workspaces.
- Do not use `any` unless there is a documented, local justification.

## 2. Code style

### 2.1 Readability
- Prefer small functions with clear names.
- Prefer early returns.
- Avoid clever one-liners in critical logic.
- Favor stable, explicit control flow over implicit behavior.

### 2.2 Mutability vs immutability
- Domain functions may return new objects for clarity, but avoid accidental large copies in hot paths.
- Avoid unnecessary object/array cloning in loops.
- Measure before micro-optimizing.

### 2.3 Imports
- Use absolute imports via TS path aliases when available.
- No deep imports into package internals. Only import from public entrypoints.

### 2.4 Error handling
- Never throw raw errors across boundaries.
- Convert internal errors into typed error objects/messages at:
  - HTTP handlers
  - realtime transport handlers
- No stack traces returned to clients.

## 3. Architecture rules

### 3.1 Packages
- `packages/shared`
  - shared types, schemas, protocol definitions
  - must have zero runtime dependencies if possible
- `packages/engine`
  - pure domain logic: docs, patches, merges, diffs
  - must not import from any app code
  - must be unit-tested with Vitest

### 3.2 Apps
- `apps/web`
  - Preact UI, Tailwind only
  - state is derived from typed docs + patches
  - web worker for heavy parsing/validation/diff work
- `apps/api`
  - Fastify API + realtime server
  - SQLite persistence
  - versioning: immutable snapshots + current pointer

## 4. Realtime rules

- WebTransport is the preferred transport when available.
- A fallback transport must exist (WebSocket) and use the exact same protocol messages.
- All realtime messages are:
  - versioned (protocol version)
  - validated at runtime
  - logged with minimal, non-sensitive metadata

### 4.1 Collaboration semantics
- Soft lock:
  - one editor per target (atomic component or page)
  - watchers see live edits
- Draft patches are broadcast but not persisted as versions.
- Only "Save" creates a new version in the database.
- Re-apply of an old version creates a new version.

## 5. Performance rules

- Keep the UI thread responsive at all times.
- CPU-heavy work goes to a Worker:
  - class normalization
  - tailwind lint/validation
  - diff summaries in history
- Debounce network sends during typing, but apply edits optimistically.

## 6. Security and safety

- Treat all inbound data as untrusted.
- Validate:
  - ids (roomId/componentId/pageId/instanceId/nodeId)
  - sizes (max className length, max patch ops)
  - rate limits (patchDraft frequency)
- Server must enforce locks and version preconditions.

## 7. Testing rules

- Unit tests:
  - engine patch application
  - merges (base + atomic + page)
  - versioning rules (save, reapply)
- Integration tests:
  - API endpoints
  - realtime protocol happy path for one room
- Tests should be deterministic. No reliance on real clocks; inject time.

## 8. Documentation rules

- Every non-trivial folder has a short README or header comment.
- Protocol changes must update shared types and include a migration note.
- Keep docs short, factual, and up to date.

## 9. Commit and review rules

- Each PR/commit should do one thing.
- No unrelated refactors in feature commits.
- Prefer adding over rewriting unless necessary.

## 10. If you are an AI agent

- Do not invent APIs, files, or behavior that is not in this repo.
- Follow the plan steps in `/plan/PLAN.md` and the referenced step files.
- If a step requires a decision, list options with trade-offs and pick the simplest safe default.
- Always implement acceptance criteria and add/update tests.

## 11. Step command protocol (for AI agents)

AI agents may receive short commands such as:

- "Execute step 01 of the plan"
- "Create step 12 of the plan"

When such a command is received, the AI MUST:

### 11.1 Step resolution

1. Locate the step file at:

   /plan/steps/STEP_XX_*.md

2. If the command is **execute**:

   - The step file MUST already exist.
   - Follow the instructions inside:
     - /plan/AI_EXECUTE_STEP_PROMPT.md
     - the step file itself

3. If the command is **create**:

   - The step file MUST NOT already exist.
   - Follow:
     - /plan/AI_CREATE_STEP_PROMPT.md

### 11.2 Scope guard (mandatory)

The AI MUST NOT:

- implement future steps
- expand scope beyond the step goal
- refactor unrelated code
- introduce new dependencies unless required by the step

### 11.3 Completion requirements

A step execution is complete only when:

- all acceptance criteria are satisfied
- typecheck passes
- tests pass
- lint passes

If any condition fails, the AI MUST stop and report.

### 11.4 Status updates

During execution:

- set step status to **in progress** at start
- set to **done** only when fully complete