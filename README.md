# KESMA — قسمة

GIS workbench to visualize, divide and compare land-division scenarios for inherited or jointly owned land.

> Planning and visualization tool only — not a legal, cadastral or valuation instrument.

- Product context: [`project-context.md`](./project-context.md)
- MVP scope & enhancements: [`docs/01-product-enhancements.md`](./docs/01-product-enhancements.md)
- Tech stack: [`docs/02-tech-stack.md`](./docs/02-tech-stack.md)
- Sprint plan & progress: [`docs/03-sprint-plan.md`](./docs/03-sprint-plan.md)

## Features

- **Property**: import GeoJSON, KML/KMZ, zipped Shapefile, GPX or CSV (projected CRS detected and reprojected), or draw parcels on satellite imagery.
- **Heirs & shares**: exact fractions, percentages, target areas or weighted parts of the remainder.
- **Scenarios**: lots from parcels, manual drawing, split/merge, topology-preserving vertex editing (lots can't leave the property), automatic parallel strips by area or by value, locks, named versions, undo/redo.
- **Value & access**: base value, value zones, point/area assets, road frontage (access = 3 m+).
- **Checks**: live allocation vs. targets (area or value, tolerance), geometry validation with one-click fixes.
- **Compare & report**: side-by-side synchronised maps with an indicator table; printable A4 report (vector plans, tables, disclaimer on every page) saved as PDF from the browser.
- **Exports**: `.kesma.json` project file, GeoJSON (parcels, lots with attributes, value layers), Excel `.xlsx` workbook and CSV tables.
- **Demo & guide**: "Try a demo" creates a sample project; `/guide` is the user guide (fr / ar / en).

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
| `pnpm analyze`              | Turbopack bundle analyzer (`next experimental-analyze`; add `--output` to save the report)   |

## Sample data

[`samples/`](./samples) holds the same property (near Mornag) in every import format: GeoJSON, KML, KMZ, a Shapefile in Carthage / Nord Tunisie, a CSV without a declared CRS, and a GPX track. Regenerate them with `node scripts/generate-samples.mjs`.

## Architecture (short)

```text
src/
├── app/            Routes: / (projects), /projects/[id] (workspace), …/compare, …/report, /guide
├── domain/         Pure TS: zod model, geometry, units — no React, no map
├── storage/        ProjectRepository interface + Dexie (IndexedDB) impl + schema migrations
├── io/             Import (GeoJSON/KML/SHP/CSV/GPX + CRS) and export (.kesma.json, GeoJSON, CSV, XLSX)
├── services/       Use cases (create, duplicate, import…) on top of the repository
├── store/          Zustand stores (active project + autosave, map UI state)
├── features/       Screens: projects, workspace panels, compare/report pages, exports
├── components/     Map, shared UI, shadcn/ui (Base UI) primitives
└── i18n/           next-intl config + messages (fr default, ar RTL, en)
```

Notes:

- **Locale** is stored in the `NEXT_LOCALE` cookie (no locale in URLs).
- **MapLibre worker** is served from `public/vendor/maplibre/<version>/` (generated, git-ignored) because bundled chunks can't resolve MapLibre's default worker URL.
- **Windows:** ports 3097–3296 are often reserved by Hyper-V (`netsh int ipv4 show excludedportrange protocol=tcp`), hence e2e on 4100.
- **Heavy code is lazy-loaded**: JSTS (validation, value model, auto-split, comparison) and the export writers load on first use; the report is rendered by the browser (`window.print()`), so Arabic shaping and RTL are exact without a PDF library.
- **Report printing**: A4 portrait via `@page`; the disclaimer footer repeats on every page (fixed footer + `<tfoot>` spacer). The `.paper` class keeps the sheet light in dark mode.

## Deployment

KESMA is a standard Next.js app with no backend state: every project lives in the user's browser.

- **Vercel** (simplest): import the repository, framework preset "Next.js", build command `pnpm build`. No environment variables are needed.
- **Any Node host**: `pnpm install --frozen-lockfile && pnpm build && pnpm start` (port 3000, set `PORT` to change). Node 20.9+.
- The locale is read from a cookie on the server, so pages are rendered dynamically: a static export (`output: "export"`) is not supported as is.
- Satellite imagery comes from Esri World Imagery, streets from OpenStreetMap: check their terms of use for public or commercial deployments.

Before releasing: `pnpm check && pnpm test:e2e && pnpm build`.
