# KESMA — Product Review & Enhancements (MVP)

> Companion to [`project-context.md`](../project-context.md). This file records what changes for the MVP and what gets added on top of the original concept.

---

## 1. MVP Constraints (updated)

| Topic | Original context | MVP decision |
| --- | --- | --- |
| Authentication | MVP feature #1 | **Removed.** Single-user, local app. |
| Database | Implicit | **None.** Everything is stored in the browser (IndexedDB). |
| Sharing | Collaboration (future) | **Project file export/import** (`.kesma.json`). Heirs share one file by email or WhatsApp. |
| Document uploads (deeds, PDFs) | §15 | **Deferred.** Without a backend, large binary files don't belong in browser storage. |
| Hosting | — | Static deployment works (Vercel, Netlify, or any static host), because no server is needed. |

**Consequence:** the application is a *client-side GIS workbench*. The code must be written so that a backend (DB + auth + collaboration) can be added later without a rewrite. See §4, Architecture principles.

---

## 2. Enhancements to the Concept

### 2.1 Clearer domain vocabulary
The context uses "parcel" for two different things. That will cause confusion in the code and in the UI, so the MVP separates them:

| Term | Meaning |
| --- | --- |
| **Project** | One division case (e.g. "Family Ben Ali — Inheritance 2026"). |
| **Property** | The land being divided, made of one or more **Original Parcels**. Read-only once imported. |
| **Original Parcel** | An imported or drawn polygon that represents existing land. It never changes. |
| **Scenario** | One proposed division of the property. |
| **Lot** | A proposed polygon inside a scenario. It can be assigned to one beneficiary. |
| **Beneficiary** | An heir or co-owner with a target share. |
| **Value Zone** | A polygon with a value per m² (e.g. irrigated area, constructible area). |
| **Asset** | A point or polygon with a fixed value (well, house, olive grove, shed). |
| **Frontage line** | A line marking road access along the property edge. |

### 2.2 Shares as exact fractions, not only percentages
Inheritance shares, especially in Tunisia and other countries using Islamic inheritance rules (farāʾiḍ), are expressed as **fractions**: 1/8, 1/6, 2/3, or residual shares. Percentages such as 33.33% cause rounding drift.

- Users can enter a share as a **fraction** (`7/24`), a **percentage**, or a **surface target**.
- Calculations use exact fractional arithmetic and round only for display.
- Validation checks that shares sum to exactly 1 (100%).
- *Future:* an optional "farāʾiḍ assistant" that suggests shares from the family structure. It would always carry a legal disclaimer (§19 of the context).

### 2.3 A simple, spatial value model in the MVP
The main message of the product is "equal area ≠ equitable". An MVP that only compares surfaces would miss that point. A **lightweight and fully configurable** value model is therefore brought into the MVP:

1. **Base value per m²** for the property.
2. **Value Zones** are drawn polygons with their own value per m², or a multiplier on the base value. Example: irrigated zone ×1.6, rocky zone ×0.5.
3. **Assets** are points or polygons with a fixed value (well = 15,000 TND). The asset's value goes to the lot that contains it.
4. **Road frontage** is computed from lot boundaries that touch a frontage line: length in metres and yes/no access.

A lot's estimated value is:
`Σ (area(lot ∩ zone) × zone value) + base value × remaining area + Σ contained assets`

This is transparent: users can see exactly why a lot is worth what it is worth. It can be configured without hard-coded rules, as required by §9.

### 2.4 Assisted division ("Auto-split by shares")
Drawing boundaries that give exactly 2.50 ha by hand is tedious. The MVP adds an assistant:

- The user picks a lot or the whole property, a **direction** (angle), and the beneficiaries.
- The system cuts the polygon into **parallel strips** whose areas match the target shares, using a binary search on the cut-line offset.
- Variant: match **value** instead of area (uses the value model).
- The result is a normal scenario that the user can still edit by hand.

This produces "Scenario 1 — Equal Surface" and "Scenario 2 — Equal Value" (§11) in one click. It is the simplest useful form of the "automatic optimization" listed as a future feature.

### 2.5 Live "move the boundary" feedback (reinforced)
- Areas, values and deviations recalculate **while dragging a vertex**, not only after the drag ends.
- The allocation panel colours each beneficiary: green within tolerance, amber close, red outside tolerance.
- The tolerance is configurable per project (default ±1% area).
- **Lock a lot** so it can't be edited by accident.
- **Precise editing:** a vertex coordinate table and a "set area" helper that moves one edge to reach a target area.

### 2.6 Scenario workflow
- **Duplicate scenario** is the main way to create variants.
- **Undo/redo** inside a scenario.
- **Scenario status:** Draft → Proposed → Agreed (a label only, with no legal meaning).
- **Snapshots:** save a named version of a scenario (covers §17 Project History without a backend).
- **Side-by-side comparison:** two synchronised maps plus the indicator table (§12).

### 2.7 Geometry validation made actionable
Beyond *detecting* problems (§14), the MVP should **show and help fix** them:
- Overlaps and gaps are drawn as red and orange highlighted areas on the map, with their size in m².
- Slivers smaller than a threshold (e.g. < 1 m²) are flagged and can be absorbed into a neighbouring lot in one click.
- Snapping to property edges and to neighbouring lot vertices while drawing prevents most gaps in the first place.
- A scenario badge shows **Valid / Incomplete / Invalid**. Exports of invalid scenarios carry a warning.

### 2.8 Local context: Tunisia first
- **Languages:** Arabic (RTL), French and English. Heirs often don't share one working language.
- **Coordinate systems:** Tunisian cadastral data often uses **Carthage / Nord Tunisie (EPSG:22391)** and **Sud Tunisie (EPSG:22392)**. Imports must detect or ask for the CRS and reproject to WGS84.
- **Units:** m², hectares and ares. The currency is configurable, with TND as the default.
- **Satellite basemap:** essential for rural parcels, where road maps show almost nothing.

### 2.9 Trust & legal position
- A disclaimer is shown on first launch, in the app footer, and on every PDF page (§19).
- The PDF report includes the method used, the value parameters, the validation status and a date, so that it reads as a **transparent working document** and not as a legal decision.
- **Privacy note:** the data never leaves the user's device. This is a genuine selling point of the no-backend MVP.

### 2.10 Onboarding & demo
- A **sample project** that loads in one click (a realistic parcel, 4 heirs, 2 scenarios). Essential for demos and user testing.
- A step-by-step **project wizard:** Property → Beneficiaries → Value (optional) → Divide → Compare → Export.

---

## 3. Revised MVP Feature List

| # | Feature | Sprint |
| --- | --- | --- |
| 1 | Create, rename, duplicate and delete projects (stored locally) | S1 |
| 2 | Export and import a project file (`.kesma.json`) | S1 |
| 3 | Interactive map with OSM and satellite basemaps, measure tool | S1 |
| 4 | Import the property: GeoJSON, KML/KMZ, Shapefile (.zip), CSV coordinates, GPX, with reprojection | S2 |
| 5 | Draw or edit the property manually | S2 |
| 6 | Beneficiaries with fraction, percentage or area shares, and target calculation | S3 |
| 7 | Scenarios: create, duplicate, rename, status | S4 |
| 8 | Draw lots, edit vertices, split, merge, delete, snapping, live area | S4 |
| 9 | Assign lots to beneficiaries, allocation table, deviations, tolerance colours | S5 |
| 10 | Geometry validation with on-map highlighting | S5 |
| 11 | Value model: base value, value zones, assets, road frontage | S6 |
| 12 | Auto-split by shares (area or value) | S6 |
| 13 | Undo/redo, snapshots | S6 |
| 14 | Scenario comparison (table and side-by-side maps) | S7 |
| 15 | Export PDF report, GeoJSON, CSV/XLSX | S7 |
| 16 | i18n (AR/FR/EN, RTL), sample project, disclaimer, deployment | S7 |

**Explicitly out of the MVP:** auth, database, collaboration, comments and voting, document uploads, cadastral API integration, terrain/slope analysis, AI suggestions, mobile app.

---

## 4. Architecture Principles (to keep the future backend cheap)

1. **The domain engine stays pure.** All geometry and allocation logic (`area`, `split`, `validate`, `allocate`, `value`) lives in framework-free TypeScript modules with unit tests. It knows nothing about React or the map.
2. **A storage adapter interface.** `ProjectRepository` with an IndexedDB implementation now and an API/DB implementation later. The UI never calls IndexedDB directly.
3. **A versioned data schema.** Every saved project has a `schemaVersion`, and migrations run on load. Project files from older versions keep working.
4. **GeoJSON everywhere.** All geometries are stored as GeoJSON in WGS84. Areas are computed geodesically, and a local metric projection is used for precise operations.
5. **The map is a view.** Map state is derived from the store and never stored inside the map library.
6. **Heavy computation runs off the main thread.** Auto-split and validation of large scenarios run in a Web Worker.
