# apps/web

Preact + Vite frontend shell for the collaboration UI.

## Routes

- `/workspace`: shell workspace placeholder plus integration debug/proof sections.
- `/history`: shell history placeholder for upcoming history UX.
- `/` and unknown paths resolve to `/workspace`.

## Styling

- Tailwind CSS is configured through `tailwind.config.ts` and `postcss.config.cjs`.
- Global styles load from `src/styles.css` using Tailwind base/components/utilities directives.
