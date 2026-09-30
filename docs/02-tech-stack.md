# KESMA — Tech Stack & Libraries (MVP)

> Constraints: Next.js, no database, no auth, all data stored in the browser. The domain logic must be reusable once a backend is added.

---

## 1. Core Framework

| Library | Purpose | Notes |
| --- | --- | --- |
| **next** (latest stable, App Router) | Application framework | The map workspace is client-only (`"use client"` + `dynamic(..., { ssr: false })`). Could ship as `output: "export"` (static) since there are no server routes. |
| **react / react-dom** | UI | |
| **typescript** | Type safety | `strict: true`. The domain model is typed end to end. |
| **pnpm** | Package manager | Fast and strict. npm also works. |

---

## 2. Map & GIS

| Library | Purpose | Why this one |
| --- | --- | --- |
| **maplibre-gl** | WebGL map rendering | Open source, **no API token or usage cost**, vector and raster tiles, fast with many polygons. |
| **react-map-gl** (`react-map-gl/maplibre`) | React bindings for MapLibre | Declarative sources and layers, controlled viewport, synced maps for side-by-side comparison. |
| **terra-draw** + **terra-draw-maplibre-gl-adapter** | Drawing and editing (polygon, line, point, select, drag vertex, snapping) | Actively maintained and map-library-agnostic. Supports vertex editing and snapping, which matter for the "move the boundary" workflow. |
| **@turf/turf** (v7) | Geospatial calculations: area, length, intersect, difference, union, booleans, bbox, centroid | Standard toolkit that works on GeoJSON. Can be imported per module (`@turf/area`, …) to reduce bundle size. |
| **jsts** | Robust topology: polygon **split by line** (polygonizer), detailed **validity reasons** (self-intersection location), snapping and precision | Turf has no native "split polygon by line" or detailed validity reports. Load it lazily or inside the worker. |
| **proj4** | Coordinate reprojection on import | Needed for Tunisian CRS (EPSG:22391 / 22392) and UTM. Store the definitions for the supported EPSG codes locally. |

**Basemaps** (no library, just tile URLs):
- OpenStreetMap / OpenFreeMap for streets.
- Satellite: **Esri World Imagery** (free with attribution, check the terms before commercial use) or **MapTiler Satellite** (free-tier API key). Keep the URLs in config so the provider can be swapped.

---

## 3. Data Import / Export

| Library | Purpose |
| --- | --- |
| **@tmcw/togeojson** | KML and GPX → GeoJSON |
| **jszip** | Unzip KMZ files. Also used to read zipped Shapefiles if needed. |
| **shpjs** | Shapefile (.zip with .shp/.dbf/.prj) → GeoJSON. Reads the `.prj` file for reprojection. |
| **papaparse** | CSV with coordinates (import), and allocation tables (export) |
| **@react-pdf/renderer** | PDF report built from React components (cover, map image, tables, disclaimer on every page) |
| **xlsx** (SheetJS CE) | Excel export. ⚠️ Install from `https://cdn.sheetjs.com` because the npm registry version is outdated. Alternative: **exceljs**. |

GeoJSON export needs no library (`JSON.stringify` + a `Blob` download). Map images for the PDF come from the MapLibre canvas (`map.getCanvas().toDataURL()` with `preserveDrawingBuffer` enabled during capture).

---

## 4. State, Persistence & Data Validation

| Library | Purpose | Notes |
| --- | --- | --- |
| **zustand** | App state (current project, scenario, selection, tool mode) | Small and fast. Map and panels subscribe through selectors. |
| **immer** (zustand middleware) | Immutable updates to nested project data | |
| **zundo** | Undo/redo for zustand | Scoped to the active scenario's lots. |
| **dexie** | IndexedDB wrapper | Typed tables (`projects`, `snapshots`), schema versions and migrations. Behind a `ProjectRepository` interface so a backend can replace it later. |
| **zod** | Runtime schemas | Validates imported `.kesma.json` files, forms and migrations. One source of truth for the types (`z.infer`). |
| **fraction.js** | Exact fractional shares (1/8, 2/3, 7/24) | Avoids rounding drift when shares must sum to exactly 1. |
| **nanoid** | IDs for projects, lots, beneficiaries | |
| **comlink** | Web Worker RPC | Runs auto-split and full validation off the main thread. |

---

## 5. UI

| Library | Purpose |
| --- | --- |
| **tailwindcss** (v4) | Styling. Logical properties (`ms-`, `pe-`) give RTL support for free. |
| **shadcn/ui** (**Base UI** primitives — current shadcn default, uses a `render` prop instead of `asChild`) | Accessible components: dialogs, sheets, tabs, dropdowns, forms, tables, tooltips. Owned in-repo. |
| **lucide-react** | Icons |
| **react-resizable-panels** (shadcn `Resizable`) | Map, side panel and allocation drawer layout |
| **@tanstack/react-table** | Allocation, comparison and vertex tables (sorting, inline editing) |
| **recharts** | Allocation charts: target vs allocated bars, deviation charts |
| **react-hook-form** + **@hookform/resolvers** | Forms (project, beneficiary, value zone, asset) with zod validation |
| **sonner** | Toast notifications (import results, validation warnings) |
| **next-themes** | Light and dark mode |
| **next-intl** | i18n for **Arabic (RTL), French and English**, with number and unit formatting |
| **cn** | Class composition (shadcn's replacement for clsx + tailwind-merge) |
| **date-fns** | Dates in scenarios, snapshots and reports |

---

## 6. Quality & Tooling

| Library | Purpose |
| --- | --- |
| **vitest** | Unit tests. **Critical for the domain engine** (area, split, allocation, validation, value model). |
| **@testing-library/react** + **jsdom** | Component tests |
| **fake-indexeddb** | Testing the Dexie repository |
| **@playwright/test** | End-to-end tests of the main flows (import → divide → export) |
| **eslint** (next config) + **prettier** + **prettier-plugin-tailwindcss** | Lint and formatting |
| **husky** + **lint-staged** | Pre-commit checks (optional) |
| **@next/bundle-analyzer** | Tracks bundle size (MapLibre, JSTS, PDF and SheetJS are heavy, so they are lazy-loaded) |

---

## 7. Install Commands (for reference, not run yet)

```bash
pnpm create next-app@latest kesma --ts --tailwind --eslint --app --src-dir --import-alias "@/*"

# Map & GIS
pnpm add maplibre-gl react-map-gl terra-draw terra-draw-maplibre-gl-adapter @turf/turf jsts proj4

# Import / export
pnpm add @tmcw/togeojson jszip shpjs papaparse @react-pdf/renderer
pnpm add https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz

# State / persistence / validation
pnpm add zustand immer zundo dexie zod fraction.js nanoid comlink

# UI
pnpm dlx shadcn@latest init
pnpm add lucide-react @tanstack/react-table recharts react-hook-form @hookform/resolvers sonner next-themes next-intl date-fns

# Types & dev tooling
pnpm add -D @types/proj4 @types/papaparse @types/geojson vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb @playwright/test prettier prettier-plugin-tailwindcss @next/bundle-analyzer
```

---

## 8. Alternatives Considered

| Option | Why it was not chosen |
| --- | --- |
| **Leaflet + Geoman** | Simple and has cut/snap out of the box, but it is DOM/SVG-based and slows down with many vertices. Some advanced Geoman features are paid. It remains a good fallback if Terra Draw proves limiting. |
| **Mapbox GL JS** | Requires a token, and pricing is usage-based. MapLibre is its open fork. |
| **OpenLayers** | Very powerful for GIS, but heavier, less React-friendly, and slower to build with for this scope. |
| **@mapbox/mapbox-gl-draw** | Older design, weak maintenance, clumsy with MapLibre. |
| **Redux Toolkit** | More boilerplate than this client-only app needs. |
| **localStorage** | ~5 MB limit and synchronous. IndexedDB (Dexie) handles larger geometries and snapshots. |

---

## 9. Folder Structure

> Implemented in S0/S1 with one addition: `src/features/` holds screen-level components (projects list, workspace) and `src/services/` holds use cases on top of the repository. See the README.

### Original proposal

```text
src/
├── app/                      # Next.js routes (locale-aware)
│   └── [locale]/
│       ├── page.tsx          # Project list / home
│       └── projects/[id]/    # Workspace: map + panels
├── domain/                   # PURE TS — no React, no map
│   ├── model/                # zod schemas & types (Project, Scenario, Lot, …)
│   ├── geometry/             # area, split, merge, snap, validate
│   ├── allocation/           # targets, deviations, tolerance
│   ├── value/                # value zones, assets, frontage
│   ├── autosplit/            # strip division by area/value
│   └── compare/              # scenario indicators
├── io/                       # importers (geojson, kml, shp, csv, gpx) & exporters (pdf, geojson, csv, xlsx, kesma.json)
├── storage/                  # ProjectRepository interface + Dexie impl + migrations
├── store/                    # zustand slices
├── workers/                  # comlink workers (autosplit, validation)
├── components/
│   ├── map/                  # MapView, layers, draw controls, legend
│   ├── panels/               # beneficiaries, lots, allocation, validation, value
│   └── ui/                   # shadcn components
├── i18n/                     # messages ar/fr/en
└── lib/                      # formatting, units, constants
```

---

## 10. Implementation Notes (S0/S1)

- **Next.js 16.3** (Turbopack by default, async `params`/`cookies`). `pnpm typecheck` runs `next typegen` first for `PageProps`/`LayoutProps`.
- **i18n without locale routing:** the locale lives in the `NEXT_LOCALE` cookie, read in `src/i18n/request.ts`. No proxy/middleware needed. Message keys are type-checked against `en.json`.
- **MapLibre v6 worker:** MapLibre resolves its worker relative to its own module, which bundled chunks break. `scripts/copy-maplibre-worker.mjs` copies it to `public/vendor/maplibre/<version>/` before `dev`/`build`, and `setWorkerUrl()` points to it. Without this, GeoJSON layers silently fail to render.
- **Arabic map labels (later sprints):** MapLibre's `setRTLTextPlugin` will be needed once lots and beneficiaries are labelled on the map.
- **Vitest** runs in Node (fast). Component tests opt into jsdom per file.
