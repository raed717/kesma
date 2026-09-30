# KESMA — MVP Sprint Plan

> Scope: [`01-product-enhancements.md`](./01-product-enhancements.md) §3 · Stack: [`02-tech-stack.md`](./02-tech-stack.md)
>
> **Assumptions:** 1 full-time developer, sprints of ~1 week (S4 and S6 are the heaviest and may take 1.5 weeks). **Total: about 8–10 weeks.** No database and no auth. All data lives in IndexedDB.

---

## Progress

| Sprint | Status | Notes |
| --- | --- | --- |
| S0 | ✅ Done (2026-09-30) | Everything except S0-4 (deploy preview): no git repo or hosting account yet. The CI workflow is written but has never run. |
| S1 | ✅ Done (2026-09-30) | 34 unit tests + 1 e2e passing. The "reload keeps the project" and "export → delete → import is identical" criteria are covered by automated tests. |
| S2 | ✅ Done (2026-09-30) | All formats import with the Carthage datum shift handled. Areas are within ±0.1% of the reference; Shapefile vs GeoJSON positions agree to < 0.5 m. 76 unit + 4 e2e tests, plus a manual pass in Chrome (FR + AR). Sample files are in `/samples`. Found and fixed during testing: selection lost after drawing, measure panel showing while drawing, RTL map-control collisions, reversed number/unit in Arabic, and saves lost on a quick reload (now saved immediately). |
| S3 | ✅ Done (2026-09-30) | Exact shares with fraction.js (fraction, percentage, target area, and a new **weighted remainder** mode for residual heirs). Live validation shows exact shortfall/excess, target areas and a stacked share bar. 96 unit + 6 e2e tests. The chart is a lightweight stacked bar; Recharts is deferred to S5 allocation charts. Found and fixed: edits lost when made in a background tab (now saved immediately when hidden), Base UI input warnings, and an ambiguous "Name" label. |
| S4 | ⏳ Next | |

## Overview

| Sprint | Theme | Demo at the end |
| --- | --- | --- |
| **S0** | Foundations | Empty app deployed, CI green, domain model typed |
| **S1** | Projects, persistence & map shell | Create a project, reload the page, it's still there. Map with satellite view. |
| **S2** | Property import & display | Drop a KML/SHP/GeoJSON file and see the property with its area |
| **S3** | Beneficiaries & shares | 4 heirs with fractional shares and computed target areas |
| **S4** | Scenarios & lot drawing | Draw, split and merge lots with live areas |
| **S5** | Allocation & validation | Assign lots and see deviations. Gaps and overlaps highlighted. |
| **S6** | Value model, auto-split & history | Equal-value scenario in one click. Undo/redo, snapshots. |
| **S7** | Compare, export, i18n & release | Compare scenarios side by side, export PDF/GeoJSON/XLSX, switch to Arabic |

---

## Definition of Done (every story)
- The feature works in Chrome, Firefox and Edge on desktop. Tablet layout is usable.
- Domain logic has **Vitest unit tests** (target ≥ 90% coverage on `src/domain`).
- There are no TypeScript errors and lint passes.
- UI strings go through i18n keys, even before the translations exist.
- Persisted data matches the zod schema. Any schema change adds a migration.
- The feature was shown in the sprint demo.

---

## S0 — Foundations

**Goal:** set up the project skeleton, tooling and the domain model that everything else depends on.

| ID | Story / Task |
| --- | --- |
| S0-1 | Initialise Next.js (App Router, TS strict, `src/`), Tailwind v4, shadcn/ui, ESLint and Prettier |
| S0-2 | Set up Vitest, Testing Library and Playwright with one sample test each |
| S0-3 | CI (GitHub Actions): lint, typecheck, test and build on every push |
| S0-4 | Deploy a preview (Vercel or a static host) |
| S0-5 | Define **zod schemas** for `Project`, `Property`, `OriginalParcel`, `Beneficiary`, `Scenario`, `Lot`, `ValueZone`, `Asset`, `FrontageLine` and `ProjectSettings` (units, currency, tolerance), all with `schemaVersion` |
| S0-6 | Set up the next-intl skeleton (ar/fr/en, RTL `dir` switch) and next-themes |
| S0-7 | App shell layout: header, resizable map area and side panel, disclaimer footer |

**Acceptance:** the app is deployed and CI is green. The domain types compile. The folder structure matches `02-tech-stack.md` §9.

---

## S1 — Projects, Persistence & Map Shell

**Goal:** a user can manage projects that survive page reloads, and see a working map.

| ID | Story / Task |
| --- | --- |
| S1-1 | `ProjectRepository` interface with a **Dexie** implementation (+ tests with fake-indexeddb) |
| S1-2 | Home page: project list (name, date, area, number of scenarios), create, rename, duplicate, delete (with confirmation) |
| S1-3 | Zustand store: active project, auto-save (debounced) to the repository |
| S1-4 | **Export and import a `.kesma.json` project file** (validated by zod, migration on import) |
| S1-5 | MapView (react-map-gl/maplibre): OSM and satellite basemap switcher, zoom, geolocate, scale bar |
| S1-6 | Measure tool: distance and area (Turf) |
| S1-7 | First-launch disclaimer modal (planning tool, not a legal instrument) |

**Acceptance:** create a project → reload → it is still there. Export the file → delete the project → import the file → it is identical. Basemap switching works.

---

## S2 — Property Import & Display

**Goal:** get the real land into the app, correctly placed.

| ID | Story / Task |
| --- | --- |
| S2-1 | Import pipeline: `File → detect format → parse → reproject → validate → preview → confirm` |
| S2-2 | Parsers: **GeoJSON**, **KML/KMZ** (togeojson + jszip), **Shapefile .zip** (shpjs, reads .prj), **GPX**, **CSV** (lat/lon or X/Y columns, column mapping UI) |
| S2-3 | **CRS handling** with proj4: auto-detect from .prj or GeoJSON, otherwise ask the user (WGS84, EPSG:22391, EPSG:22392, UTM 32N) |
| S2-4 | Preview dialog before import: feature count, total area, map preview, select which polygons become Original Parcels |
| S2-5 | Draw the property manually (Terra Draw polygon mode) as an alternative to import |
| S2-6 | Display the property: outline and fill, labels, fit to bounds, click a parcel to open its info panel |
| S2-7 | Parcel attributes form: identifier, land use, road/water access, irrigation, buildings, notes |
| S2-8 | Area computation (geodesic) shown in m², ares or ha according to project units |
| S2-9 | Sample test fixtures (one file per format, including a Tunisian CRS file) |

**Acceptance:** each supported format imports correctly with a known area (±0.1% compared with the reference). An invalid file shows a clear error. Original parcels become read-only once confirmed.

---

## S3 — Beneficiaries & Shares

**Goal:** define who receives what.

| ID | Story / Task |
| --- | --- |
| S3-1 | Beneficiary CRUD panel: name, colour (auto-assigned, editable), notes |
| S3-2 | Share input in three modes: **fraction** (`7/24`), **percentage**, **target area** (fraction.js for exact maths) |
| S3-3 | Validation: shares sum to exactly 1. Shows the remaining or excess share. |
| S3-4 | Computed targets: target area per beneficiary (and target value once S6 lands) |
| S3-5 | Summary bar chart of shares (Recharts) |
| S3-6 | Domain tests: fraction sums, conversions, rounding for display only |

**Acceptance:** 1/8 + 7/8 = 100% exactly. 1/3 × 3 = 100% with no drift. The target areas add up to the property area.

---

## S4 — Scenarios & Lot Drawing ⚠️ *highest technical risk*

**Goal:** create proposed divisions by drawing and editing lots.

| ID | Story / Task |
| --- | --- |
| S4-1 | Scenario management: create (empty, or "start from the whole property as one lot"), duplicate, rename, delete, switch |
| S4-2 | Terra Draw integration: draw polygon, select, **drag vertices**, add or remove vertices, delete lot |
| S4-3 | **Snapping** to property edges and to neighbouring lot vertices and edges |
| S4-4 | **Split lot by line** (JSTS polygonizer), then clip the result to the property |
| S4-5 | **Merge** adjacent lots (Turf union) |
| S4-6 | Clip drawn lots to the property boundary automatically (option) |
| S4-7 | **Live area** label on each lot, updated while dragging |
| S4-8 | Lots list panel: name, area, assigned beneficiary, lock toggle |
| S4-9 | Precise edit: vertex coordinate table (edit X/Y) |
| S4-10 | Spike (first 1–2 days): validate that Terra Draw handles snapping and editing adjacent polygons well. Fallback: Leaflet + Geoman. |

**Acceptance:** split a 10 ha lot into 4 lots. The areas sum to 10 ha (±0.01%). Dragging a shared vertex updates both lots live. Locked lots can't be edited.

---

## S5 — Allocation & Validation

**Goal:** show the consequences of a division, and detect when it is broken.

| ID | Story / Task |
| --- | --- |
| S5-1 | Assign a lot to a beneficiary (from the lot panel or a map context menu). Lots take the beneficiary's colour. |
| S5-2 | **Allocation table:** allocated vs target area, difference (ha and %), number of lots per beneficiary |
| S5-3 | Tolerance setting per project (default ±1%), with green/amber/red status per beneficiary |
| S5-4 | Allocation chart: target vs allocated |
| S5-5 | Validation engine (domain, run in a worker): **overlaps, gaps, self-intersections, invalid rings, outside the property, unassigned lots, duplicates, slivers** |
| S5-6 | Validation panel listing the issues. Clicking an issue zooms to it. Problem areas are highlighted on the map. |
| S5-7 | "Absorb sliver into neighbour" quick fix |
| S5-8 | Scenario badge **Valid / Incomplete / Invalid** and status label (Draft / Proposed / Agreed) |

**Acceptance:** moving a boundary updates the allocation table in under 100 ms for 30 lots. A deliberately created gap is detected, shown, and can be fixed.

---

## S6 — Value Model, Auto-split & History

**Goal:** go beyond area, and speed up scenario creation.

| ID | Story / Task |
| --- | --- |
| S6-1 | Project value settings: currency, **base value per m²** |
| S6-2 | **Value Zones:** draw a polygon, set a value per m² or a multiplier, name, colour, and a toggleable layer |
| S6-3 | **Assets:** point or polygon with a fixed value (well, house, trees…). Value goes to the lot that contains it. |
| S6-4 | **Frontage lines:** mark road edges. Frontage length and access yes/no computed per lot. |
| S6-5 | Value engine (domain): value per lot and per beneficiary, target value, value deviation. Added to the allocation table. |
| S6-6 | **Auto-split by shares:** choose a polygon, a direction angle and an ordered list of beneficiaries → parallel strips matched on **area** or **value** (binary search, in a worker) → creates a new scenario |
| S6-7 | **Undo/redo** (zundo) scoped to the active scenario, with Ctrl+Z / Ctrl+Y |
| S6-8 | **Snapshots:** save a named version of a scenario and restore it (§17 Project History) |

**Acceptance:** auto-split of a 10 ha polygon into shares 25/25/30/20 gives areas within ±0.1%. Value mode gives value deviations of ≤ 1%. Undo restores the geometry exactly.

---

## S7 — Compare, Export, i18n & Release

**Goal:** make results shareable and presentable, and ship the MVP.

| ID | Story / Task |
| --- | --- |
| S7-1 | **Scenario comparison table:** area deviation (max/avg), value deviation, beneficiaries with road access, number of separate lots, validation status |
| S7-2 | **Side-by-side view:** two synchronised maps showing two chosen scenarios |
| S7-3 | **PDF report** (@react-pdf/renderer): cover (project, date), property map, scenario map with legend, allocation table, value parameters, validation status, notes, disclaimer on every page. Arabic font support. |
| S7-4 | **GeoJSON export** (property, lots with attributes, value zones) |
| S7-5 | **CSV / XLSX export** of the allocation and comparison tables |
| S7-6 | Complete the **AR/FR/EN translations** and run an RTL layout pass (panels, tables, PDF) |
| S7-7 | **Sample project** ("Try a demo") and a first-run guided wizard |
| S7-8 | Performance pass: lazy-load JSTS, the PDF renderer and SheetJS. Check the bundle with the analyzer. |
| S7-9 | E2E tests of the main flows: import → beneficiaries → split → assign → validate → export |
| S7-10 | Production deployment, README, user guide page |

**Acceptance:** a new user can go from "Try a demo" to an exported PDF in under 5 minutes. The PDF renders correctly in Arabic and French.

---

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Drawing library can't handle shared edges or snapping between adjacent lots | High | S4-10 spike on day 1. Leaflet + Geoman as the fallback. Always clip and snap in the domain layer. |
| Area inaccuracy (projection issues) | High | Geodesic area (Turf), tests checked against known surveyed areas, local metric projection for splits |
| Tunisian CRS files are imported without a .prj | Medium | Explicit CRS picker plus a sanity check (is the result inside Tunisia's bounding box?) |
| Browser storage cleared by the user | Medium | Prominent "Export project file" action, backup reminder, request `navigator.storage.persist()` |
| Arabic text in the PDF | Medium | Embed an Arabic font (e.g. Noto Naskh / Cairo) in react-pdf and test early (S3/S4 spike) |
| Users read the numbers as a legal verdict | Medium | Disclaimer everywhere, neutral wording ("deviation", not "unfair") |
| Scope creep (collaboration, AI) | Medium | Out-of-MVP list in `01-product-enhancements.md` §3 |

---

## After the MVP (candidate Phase 2)
1. Backend: PostgreSQL + **PostGIS**, auth (e.g. Auth.js / Clerk), a server `ProjectRepository`.
2. Collaboration: invite heirs, comments on lots, accept/reject proposals, activity log.
3. Document uploads (deeds, survey plans) in object storage.
4. Terrain and slope analysis (DEM), distance-to-road analysis.
5. Boundary optimisation (multi-criteria), AI-assisted suggestions.
6. Farāʾiḍ share assistant (with legal disclaimer).
7. Cadastral data integration, PWA or mobile field mode (GPS boundary capture).
