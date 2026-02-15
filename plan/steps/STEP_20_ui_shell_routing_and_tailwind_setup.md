# STEP_20: UI shell + routing + Tailwind setup

Status: completed (2026-02-15)

## Goal
Establish the first production-oriented frontend structure in `apps/web` by introducing a minimal app shell, route wiring, and Tailwind styling setup so later feature steps can mount into stable screens without changing core layout foundations.

## Acceptance criteria
- [x] `apps/web` includes Tailwind CSS configured and loaded through the existing Vite + Preact pipeline.
- [x] `apps/web` renders a persistent shell layout with a stable top-level frame (for example header + main content region) that wraps routed content.
- [x] Frontend routing is implemented with at least the planned primary surfaces represented as placeholder routes (workspace/editor and history), each with deterministic placeholder content.
- [x] The default route deterministically resolves to the workspace/editor shell route.
- [x] Existing debug/proof sections from earlier backend steps remain accessible from the shell (either on the default route or a dedicated debug route) without introducing editor/history feature logic from later steps.
- [x] No realtime protocol, lock UX, renderer node overlay, or version-history interaction logic is implemented in this step.
- [x] `apps/web` tests are updated to cover shell render + route switching behavior deterministically.
- [x] `npm run typecheck --workspace @collaborative-component-customizer/web` passes.
- [x] `npm run test --workspace @collaborative-component-customizer/web` passes.
- [x] `npm run lint --workspace @collaborative-component-customizer/web` passes.

## Technical analysis
- Keep scope strictly to frontend scaffolding: layout, route boundaries, and baseline styling pipeline.
- Use a minimal route tree that anticipates later steps without pre-implementing their behavior:
  - workspace/editor surface (future STEP_21-25)
  - history surface (future STEP_26)
  - optional debug surface for existing proof blocks.
- Tailwind setup should be conventional and minimal:
  - content globs cover `apps/web/src/**/*.{ts,tsx,html}`
  - base/components/utilities directives loaded from the existing stylesheet entry.
- Keep placeholder route components lightweight and typed; no API contract changes or backend coupling introduced.
- Preserve deterministic testability by asserting static shell landmarks and route-specific placeholder text.

## Subtasks
1. Add Tailwind tooling/config in `apps/web`
   - Add required Tailwind config/postcss wiring files.
   - Ensure global stylesheet includes Tailwind directives and remains the single style entrypoint.

2. Create route-level page placeholders
   - Add minimal route components for workspace/editor and history surfaces.
   - Keep components presentational and deterministic.

3. Introduce app shell + router composition
   - Refactor `app.tsx` to render a persistent shell wrapper and route outlet.
   - Configure default route redirect/fallback to workspace/editor.

4. Preserve and place existing debug proof UI
   - Mount existing proof/debug sections inside an explicit shell location (default route or dedicated debug route).
   - Ensure no loss of visibility for current backend proof outputs.

5. Update frontend tests
   - Add/adjust tests for shell landmarks, default route behavior, and deterministic route content.

6. Documentation and quality gates
   - Update `apps/web/README.md` with route map and Tailwind setup notes.
   - Run web lint, tests, and typecheck.

## Risks and mitigations
- Risk: Shell/routing changes can accidentally break existing debug proof visibility.
  - Mitigation: Add explicit acceptance criterion and test coverage for proof content presence.
- Risk: Tailwind setup may conflict with existing CSS baseline.
  - Mitigation: Keep styling changes minimal and limit to standard Tailwind directives + existing app stylesheet entry.
- Risk: Scope creep into future editor/history features.
  - Mitigation: Use static placeholders only and defer all behavior to subsequent steps.

## Test plan
- Unit/component tests in `apps/web/src/app.test.tsx` (or adjacent test files):
  - shell frame renders deterministic landmarks
  - default route resolves to workspace/editor placeholder
  - navigating to history route renders history placeholder content
  - existing debug/proof section remains visible from its intended route
- Manual verification:
  - run web app and confirm Tailwind styles are applied to shell layout
  - confirm route transitions work via navigation controls
  - confirm no editor/history business behavior exists beyond placeholders
- Run:
  - `npm run typecheck --workspace @collaborative-component-customizer/web`
  - `npm run test --workspace @collaborative-component-customizer/web`
  - `npm run lint --workspace @collaborative-component-customizer/web`

## TypeScript implications
- Route scaffolding remains strictly typed in `apps/web` with explicit route unions and no `any` usage.
- New Tailwind/PostCSS config files do not alter TypeScript strictness settings.
- Public package imports remain unchanged (`@collaborative-component-customizer/engine`, `@collaborative-component-customizer/shared`) and no deep internal imports are introduced.
