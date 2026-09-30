# KESMA — قسمة

GIS workbench to visualize, divide and compare land-division scenarios for inherited or jointly owned land.

> Planning and visualization tool only — not a legal, cadastral or valuation instrument.

- Product context: [`project-context.md`](./project-context.md)
- MVP scope & enhancements: [`docs/01-product-enhancements.md`](./docs/01-product-enhancements.md)
- Tech stack: [`docs/02-tech-stack.md`](./docs/02-tech-stack.md)
- Sprint plan & progress: [`docs/03-sprint-plan.md`](./docs/03-sprint-plan.md)

## MVP constraints

No backend, no database, no auth. Projects live in the browser (IndexedDB) and are shared as `.kesma.json` files.

## Getting started

Requirements: Node 20.9+ (22 recommended), pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

## Scripts

| Command                     | What it does                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | Dev server (copies the MapLibre worker to `public/vendor` first)                             |
| `pnpm build` / `pnpm start` | Production build / server                                                                    |
| `pnpm lint`                 | ESLint                                                                                       |
| `pnpm typecheck`            | Next route types + `tsc`                                                                     |
| `pnpm test`                 | Unit tests (Vitest) — domain, storage, import/export, i18n                                   |
| `pnpm test:e2e`             | End-to-end tests (Playwright, port 4100). First run: `pnpm exec playwright install chromium` |
| `pnpm check`                | lint + typecheck + unit tests                                                                |
| `pnpm format`               | Prettier                                                                                     |

## Sample data

[`samples/`](./samples) holds the same property (near Mornag) in every import format: GeoJSON, KML, KMZ, a Shapefile in Carthage / Nord Tunisie, a CSV without a declared CRS, and a GPX track. Regenerate them with `node scripts/generate-samples.mjs`.

## Architecture (short)

```text
src/
├── app/            Next.js routes: / (projects) and /projects/[id] (workspace)
├── domain/         Pure TS: zod model, geometry, units — no React, no map
├── storage/        ProjectRepository interface + Dexie (IndexedDB) impl + schema migrations
├── io/             File formats (.kesma.json today; GeoJSON/KML/SHP/… in Sprint 2)
├── services/       Use cases (create, duplicate, import…) on top of the repository
├── store/          Zustand stores (active project + autosave, map UI state)
├── features/       Screens: projects list, workspace
├── components/     Map, shared UI, shadcn/ui (Base UI) primitives
└── i18n/           next-intl config + messages (fr default, ar RTL, en)
```

Notes:

- **Locale** is stored in the `NEXT_LOCALE` cookie (no locale in URLs).
- **MapLibre worker** is served from `public/vendor/maplibre/<version>/` (generated, git-ignored) because bundled chunks can't resolve MapLibre's default worker URL.
- **Windows:** ports 3097–3296 are often reserved by Hyper-V (`netsh int ipv4 show excludedportrange protocol=tcp`), hence e2e on 4100.
