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

## Styling

- Tailwind CSS is configured through `tailwind.config.ts` and `postcss.config.cjs`.
- Global styles load from `src/styles.css` using Tailwind base/components/utilities directives.
