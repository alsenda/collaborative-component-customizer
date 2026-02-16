# apps/web

Preact + Vite frontend shell for the collaboration UI.

## Routes

- `/workspace`: typed component template renderer with node selection overlay proof plus integration debug/proof sections.
- `/history`: shell history placeholder for upcoming history UX.
- `/` and unknown paths resolve to `/workspace`.

## Workspace renderer proof

- The workspace route renders deterministic demo instances from typed template definitions.
- Clicking a rendered node sets a single selected target payload (`componentId`, `instanceId`, `nodeId`).
- A visible "Node selection proof" block shows the current selected payload or `none`.

## Atomic editor proof

- The workspace route includes a minimal atomic editor for global component-node class overrides.
- Atomic overrides are keyed by (`componentId`, `nodeId`) and apply to all matching component instances.
- A visible "Atomic overrides proof" block shows the current override payload or `none`.

## Page editor proof

- The workspace route includes a minimal page editor for scoped node class overrides.
- Page overrides are keyed by (`pageId`, `instanceId`, `nodeId`) and apply only to the targeted instance node.
- A visible "Page overrides proof" block shows the current override payload or `none`.

## Class resolution order

- Rendered className precedence is deterministic: template base className, then atomic override, then page override.

## Styling

- Tailwind CSS is configured through `tailwind.config.ts` and `postcss.config.cjs`.
- Global styles load from `src/styles.css` using Tailwind base/components/utilities directives.
