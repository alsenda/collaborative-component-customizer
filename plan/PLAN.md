---

## Project Overview (source of intent)

### Mission

Build a **real-time collaborative component customization platform** that demonstrates senior-level frontend architecture, realtime systems design, and deterministic versioning.

The system allows multiple users to:

- edit Tailwind classNames of component nodes
- see changes live in real time
- enforce single-editor soft locks
- maintain immutable version history
- re-apply any previous version safely

This project is intentionally optimized for:

- clarity
- correctness
- performance
- explainability in technical interviews
- safe AI-assisted development

---

## Realtime Transport Policy (authoritative)

For this project phase, realtime communication is implemented using:

- **WebTransport (HTTP/3) only**

There is intentionally:

- no WebSocket fallback
- no SSE fallback
- no polling fallback

### Rationale

This project is an architectural and performance demonstration.  
We deliberately prioritize:

- modern transport showcase
- clean protocol plumbing
- reduced surface area

over maximum browser compatibility.

### Future flexibility

The realtime dispatcher and connection abstractions MUST remain transport-agnostic so that a fallback transport could be added in a future step if explicitly planned.

However, **no fallback transport may be implemented unless the roadmap is explicitly updated.**

## Core Product Model

The platform operates on **two layers of styling**:

### 1. Atomic component overrides (global)

Edits at the atomic level affect **all instances of a component**.

Example:

- Editing `Button.root` updates every Button everywhere.
- Stored per `(roomId, componentId)`.

Purpose:

- simulate design-system level changes
- demonstrate global propagation
- show deterministic merge behavior

---

### 2. Page-level overrides (scoped)

Edits at the page level affect **only specific instances**.

Example:

- Checkout page primary button is larger.
- Stored per `(roomId, pageId, instanceId)`.

Purpose:

- demonstrate scoped overrides
- show proper precedence layering
- mirror real design tool behavior

---

## Style Resolution Order (critical invariant)

Rendering MUST always merge styles in this order:

1. Base template classes (hardcoded in component templates)
2. Atomic overrides (global)
3. Page overrides (scoped)

Later layers override earlier ones.

Any implementation that violates this order is incorrect.

---

## Collaboration Model

### Soft lock (single editor)

For any editable target:

- exactly **one editor** may hold the lock
- unlimited watchers may observe
- watchers receive live draft updates
- only the lock holder may mutate

Locks apply to:

- atomic component editor
- page editor

Locks must:

- expire via heartbeat
- be enforced server-side
- never trust the client

---

### Draft vs Versioned changes

There are two kinds of changes:

#### Draft patches (realtime)

- emitted while typing
- broadcast to watchers
- NOT persisted as versions
- may be frequent and high-volume

#### Saved versions (persistent)

Created only when the user presses **Save**.

Save must:

- create an immutable snapshot
- increment version number
- update the current pointer
- broadcast the new version

Re-applying a version MUST create a new version (no history rewriting).

---

## Realtime Transport Strategy

Primary transport:

- **WebTransport (HTTP/3)**

Fallback transport:

- **WebSocket**

Requirements:

- identical protocol messages
- transport-agnostic client
- graceful fallback if WebTransport unavailable

The system MUST remain fully functional on fallback transport.

---

## Performance Objectives

The UI must remain responsive under:

- rapid typing
- frequent remote patches
- history browsing
- multi-user presence

Therefore:

- heavy class processing runs in a Web Worker
- UI thread must not perform expensive normalization
- optimistic updates are required
- network sends should be debounced but UI immediate

This project is used to demonstrate **main-thread vs worker performance characteristics**.

---

## Non-Goals (important guardrails)

This project intentionally does NOT aim to:

- be a full design tool
- support arbitrary DOM editing
- support arbitrary CSS authoring
- implement CRDT/OT complexity
- implement Tailwind JIT at runtime
- implement full SSR

If a proposed change pushes toward these, prefer the simpler model.

---

## Definition of Success

The project is considered successful when:

- multiple users can edit and observe in real time
- locks are correctly enforced
- version history is immutable and replayable
- style layering is deterministic
- the codebase remains small, clean, and testable
- the system is easy to explain in a senior frontend interview

All planning and implementation decisions must optimize for these goals.

# Development Plan (mutable)

This folder is intentionally gitignored.

It is a working area for ongoing planning and coordination during development.
The source of truth for implemented behavior is always the code + tests.

## How to use this plan

- Work step-by-step.
- Each step has its own file under `/plan/steps/STEP_XX_*.md`.
- Do not start a step unless its acceptance criteria are clear.
- When a step is completed, update its status in this PLAN.md.
- Internal planning labels must never be copied into committed app code, tests, READMEs, route paths, or file names.

## Roadmap overview

### Phase 0: Foundations
- STEP_00: Repo scaffold and tooling
- STEP_01: Shared protocol + schemas
- HOTFIX_01: Dependency hygiene + shared package resolution
- STEP_02: Engine domain model + tests

### Phase 1: Backend
- STEP_10: SQLite schema + migrations
- STEP_11: HTTP API for current docs + version history
- STEP_12: Realtime server with WebTransport
- STEP_13: Locks + presence
- STEP_14: Versioning: save + reapply
- STEP_15: Remove temporary demo seed bootstrap

### Phase 2: Frontend
- STEP_20: UI shell + routing + Tailwind setup
- STEP_21: Component templates + renderer + node selection overlay
- STEP_22: Atomic editor (global overrides)
- STEP_23: Page editor (scoped overrides)
- STEP_24: Worker: normalization + lint + diff summary
- STEP_25: Realtime sync + optimistic drafts + lock UX
- STEP_26: History UI: list, preview, reapply

### Phase 3: Quality
- STEP_30: Integration tests (API + realtime)
- STEP_31: Performance checks + profiling notes
- STEP_32: Polishing: accessibility, keyboard navigation

## Current status

- [x] STEP_00 Repo scaffold and tooling
- [x] STEP_01 Shared protocol + schemas
- [x] HOTFIX_01 Dependency hygiene + shared package resolution
- [x] STEP_02 Engine domain model + tests
- [x] STEP_10 SQLite schema + migrations
- [x] STEP_11 HTTP API for current docs + version history
- [x] STEP_12 Realtime server (WebTransport)
- [x] STEP_13 Locks + presence
- [ ] STEP_14 Versioning: save + reapply
- [ ] STEP_15 Remove temporary demo seed bootstrap
- [ ] STEP_20 UI shell + Tailwind
- [ ] STEP_21 Component templates + renderer + node selection
- [ ] STEP_22 Atomic editor
- [ ] STEP_23 Page editor
- [ ] STEP_24 Worker tooling
- [ ] STEP_25 Realtime sync + lock UX
- [ ] STEP_26 History UI
- [ ] STEP_30 Integration tests
- [ ] STEP_31 Performance checks
- [ ] STEP_32 Polish

## Step template

Each step file must include:
- Goal
- Acceptance criteria
- Technical analysis
- Subtasks (with enough detail that another dev or AI can execute)
- Risks and mitigations
- Test plan
- TypeScript implications (types, strictness, public exports)

## Quick AI commands

AI agents may be instructed with short commands:

- "Execute step XX of the plan"
- "Create step XX of the plan"

Step number resolution:

- STEP_00 → STEP_00_*.md
- STEP_01 → STEP_01_*.md
- etc.

The AI must follow the Step command protocol defined in RULES.md.