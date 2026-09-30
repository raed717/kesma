# Project Context — GIS Land Division & Inheritance Platform 'KESMA'

## 1. Project Overview

The project is a **GIS-based web application designed to help families and co-owners visualize, plan, and compare different ways of dividing inherited land or jointly owned properties**.

When a property owner dies and leaves land to several heirs, dividing the property can become a difficult process. Conflicts may arise because the heirs may consider that the proposed division is not equitable.

The application aims to provide a **visual, transparent, and measurable environment** where users can visualize the original land parcels, define the shares of each beneficiary, create different division scenarios, and compare the resulting allocations.

The application does **not replace legal, cadastral, surveying, or notarial procedures**. Its purpose is to assist with planning, visualization, negotiation, and preparation of potential land-division scenarios.

---

# 2. Problem Statement

Dividing land between several heirs is more complicated than simply dividing the total surface area.

For example, two heirs may each receive 3 hectares, but the two areas may have very different characteristics:

* One parcel may have direct road access.
* One parcel may have irrigation infrastructure.
* One parcel may be more suitable for construction.
* One parcel may contain buildings or existing infrastructure.
* One parcel may have better terrain or agricultural potential.
* One parcel may be located in a more valuable area.

As a result, a division that is mathematically equal in terms of area may not be perceived as equitable by the beneficiaries.

Traditional discussions around land division are often based on paper plans, cadastral documents, measurements, and verbal negotiations. This makes it difficult for everyone involved to understand and compare proposed solutions.

The application addresses this problem by combining **GIS visualization, spatial analysis, property information, and scenario-based land division**.

---

# 3. Main Objective

The main objective is to create a platform that allows users to:

* Visualize inherited or jointly owned land on an interactive map.
* Identify and manage the original property boundaries.
* Define beneficiaries and their expected shares.
* Divide land into multiple proposed parcels.
* Calculate the surface area of each proposed parcel.
* Compare the allocation between beneficiaries.
* Take relevant land characteristics into account.
* Create and compare multiple division scenarios.
* Modify boundaries interactively.
* Identify potential imbalances between beneficiaries.
* Export proposed division plans for further review.

The system should help transform a potentially subjective discussion into a **clear and visual decision-support process**.

---

# 4. Target Users

### Primary users

* Families dealing with inheritance.
* Property co-owners.
* Landowners preparing a future division.
* Individuals negotiating the distribution of jointly owned land.

### Professional users

The platform could also be useful for:

* Surveyors / land surveyors.
* Notaries.
* Real-estate professionals.
* Agricultural consultants.
* Lawyers dealing with property and inheritance.
* Local authorities or cadastral professionals.

Professional users could use the platform to prepare and visualize different scenarios before the final legal or surveying process.

---

# 5. Core Application Concept

The application revolves around the concept of a **Land Division Project**.

A project represents one property or a group of properties that need to be divided.

Example:

**Project: Family Ben Ali — Inheritance 2026**

```text
Original Property
       │
       ├── Parcel 1
       ├── Parcel 2
       └── Parcel 3
              │
              ▼
       Beneficiaries
       ├── Heir A
       ├── Heir B
       ├── Heir C
       └── Heir D
              │
              ▼
       Division Scenarios
       ├── Scenario 1
       ├── Scenario 2
       └── Scenario 3
```

Each scenario represents a different proposed way of dividing the original property.

---

# 6. Main Features

## 6.1 Interactive GIS Map

The central component of the application is an interactive GIS map.

Users can:

* Display property boundaries.
* Zoom and pan around the property.
* Select parcels.
* Display satellite imagery or base maps.
* Display cadastral boundaries.
* View parcel information.
* Measure distances and areas.
* Draw and edit proposed boundaries.

The map should provide an intuitive visual representation of the entire division process.

---

## 6.2 Property / Parcel Management

Users can create and manage properties and parcels.

Each parcel can contain information such as:

* Parcel identifier.
* Surface area.
* Location.
* Land-use type.
* Ownership information.
* Existing buildings.
* Road access.
* Water access.
* Irrigation.
* Other relevant characteristics.
* Additional notes.

Original parcels should remain identifiable even when multiple division scenarios are created.

---

## 6.3 Beneficiary Management

A project can contain multiple beneficiaries.

For each beneficiary, the system can store:

* Name.
* Share percentage.
* Target surface area.
* Target estimated value.
* Notes.

Example:

```text
Total property: 10 hectares

Heir A → 25%
Heir B → 25%
Heir C → 30%
Heir D → 20%
```

The system can automatically calculate the corresponding target allocation.

---

# 7. Land Division / Drawing Tool

Users can interactively create proposed boundaries directly on the map.

Possible operations include:

* Draw polygons.
* Edit polygon vertices.
* Move boundaries.
* Split existing polygons.
* Merge polygons.
* Delete proposed divisions.
* Adjust boundaries manually.
* Validate geometries.

The system should automatically calculate the surface area after every modification.

Example:

```text
Original parcel
       │
       ▼
 ┌───────────────┐
 │               │
 │               │
 │               │
 └───────────────┘

        ↓ Split

 ┌───────┬───────┐
 │   A   │   B   │
 │       │       │
 │       │       │
 └───────┴───────┘
```

---

# 8. Allocation Calculation

For every proposed division, the system calculates the allocation received by each beneficiary.

Example:

| Beneficiary | Allocated Area | Target Area | Difference |
| ----------- | -------------: | ----------: | ---------: |
| Heir A      |        2.45 ha |     2.50 ha |   -0.05 ha |
| Heir B      |        2.55 ha |     2.50 ha |   +0.05 ha |
| Heir C      |        3.00 ha |     3.00 ha |          0 |
| Heir D      |        2.00 ha |     2.00 ha |          0 |

This allows users to immediately identify differences between the planned allocation and the intended shares.

---

# 9. Land Value / Quality Factors

Surface area alone should not necessarily determine whether a division is equitable.

The application should therefore support additional characteristics that can influence the estimated value of a parcel.

Possible factors include:

### Accessibility

* Road access.
* Distance to roads.
* Accessibility by vehicle.

### Water

* Irrigation availability.
* Wells.
* Water infrastructure.

### Terrain

* Slope.
* Elevation.
* Terrain characteristics.

### Land Use

* Agricultural land.
* Residential land.
* Forest.
* Unused land.
* Other categories.

### Existing Assets

* Buildings.
* Houses.
* Wells.
* Agricultural infrastructure.
* Other structures.

### Location

* Distance to urban areas.
* Distance to important infrastructure.
* Local land value.

These parameters can later be combined into an **estimated land-value model**.

The value model should be configurable rather than hard-coded.

---

# 10. Fairness / Balance Analysis

The application can calculate several indicators for each beneficiary.

Examples:

* Allocated surface.
* Target surface.
* Surface difference.
* Estimated value.
* Target value.
* Value difference.
* Accessibility.
* Number of separate parcels.
* Road access.
* Water access.

Example:

```text
HEIR A

Area
2.48 ha / 2.50 ha

Area difference
-0.8%

Estimated value
€98,500 / €100,000

Value difference
-1.5%

Road access
Yes

Water access
Yes
```

The purpose is not for the system to declare that a division is legally or objectively "fair", but to provide **transparent measurements that users can discuss and validate**.

---

# 11. Division Scenarios

Users should be able to create multiple proposed divisions without modifying the original property.

Example:

### Scenario 1 — Equal Surface

Each beneficiary receives approximately the same surface area.

### Scenario 2 — Equal Estimated Value

The boundaries are adjusted so that the estimated value received by each beneficiary is closer to their target share.

### Scenario 3 — Access Optimized

The division attempts to provide practical road/access conditions for each beneficiary.

Users can switch between scenarios and visually compare them.

---

# 12. Scenario Comparison

The application should provide a comparison between proposed scenarios.

Example:

| Indicator                      | Scenario 1 | Scenario 2 | Scenario 3 |
| ------------------------------ | ---------: | ---------: | ---------: |
| Area deviation                 |       2.4% |       0.8% |       1.5% |
| Estimated value deviation      |       8.2% |       1.7% |       3.1% |
| Beneficiaries with road access |        3/4 |        4/4 |        4/4 |
| Separate parcels               |          7 |          6 |          5 |

This allows the family or professional advisor to understand the consequences of each proposal.

---

# 13. Interactive Boundary Editing

A major feature of the application should be the ability to adjust proposed boundaries directly on the map.

When a boundary is moved, the application should automatically update:

* Parcel geometry.
* Surface area.
* Beneficiary allocation.
* Estimated value.
* Difference from target.
* Scenario statistics.

This creates an interactive **"move the boundary and immediately see the consequences"** workflow.

---

# 14. Geometry Validation

Because the application deals with geographic boundaries, the system should validate proposed geometries.

Validation can detect:

* Overlapping parcels.
* Gaps between parcels.
* Invalid polygons.
* Self-intersections.
* Parcels extending outside the original property.
* Unassigned areas.
* Duplicate geometries.

A scenario should be clearly marked when its geometry is incomplete or invalid.

---

# 15. Documents and Data Import

The platform should support importing existing geographic data.

Potential formats:

* GeoJSON.
* KML/KMZ.
* Shapefile.
* CSV with coordinates.
* GPS data.

For professional workflows, users may also upload supporting documents such as:

* Property deeds.
* Cadastral documents.
* Survey plans.
* Ownership documents.
* Supporting PDFs.

---

# 16. Export

Users should be able to export the results of a proposed division.

Possible outputs:

### PDF

A professional division report containing:

* Property map.
* Original boundaries.
* Proposed boundaries.
* Beneficiary names.
* Areas.
* Estimated values.
* Scenario information.
* Notes.
* Date and project information.

### GeoJSON

For use in GIS software.

### CSV / Excel

Containing allocation and measurement information.

---

# 17. Project History

Every proposed division should be saved as a separate version or scenario.

Example:

```text
Project
│
├── Original Property
│
├── Scenario 01
│   └── Created 01/10/2026
│
├── Scenario 02
│   └── Created 02/10/2026
│
└── Scenario 03
    └── Created 03/10/2026
```

Users should be able to return to previous proposals without losing earlier work.

---

# 18. Collaboration

A future version could allow multiple family members or professionals to access the same project.

Possible capabilities:

* Invite participants.
* View the same project.
* Comment on proposed divisions.
* Suggest modifications.
* Accept or reject a proposal.
* Maintain an activity history.

This could eventually turn the application into a **collaborative land-division workspace**.

---

# 19. Important Legal Position

The application should clearly communicate that it is a **planning and visualization tool**.

It should not automatically determine:

* Legal inheritance rights.
* Legal ownership.
* Final cadastral boundaries.
* Official land valuation.
* Legal validity of a subdivision.

Final property division should remain subject to the applicable laws and validation by the appropriate professionals and authorities.

---

# 20. Proposed MVP

The first version should remain relatively focused.

### MVP Features

1. User authentication.
2. Create a land-division project.
3. Upload/import a property polygon.
4. Display the property on an interactive map.
5. Add beneficiaries.
6. Define each beneficiary's target share.
7. Draw proposed division boundaries.
8. Automatically calculate areas.
9. Assign each resulting parcel to a beneficiary.
10. Display allocation statistics.
11. Validate geometry.
12. Save multiple scenarios.
13. Compare scenarios.
14. Export a PDF report.
15. Export GeoJSON.

### Future Features

* Automated land-value estimation.
* Satellite imagery analysis.
* Terrain/slope analysis.
* Road/accessibility analysis.
* AI-assisted division suggestions.
* Automatic optimization of parcel boundaries.
* Collaborative family workspace.
* Comments and voting.
* Professional surveyor workflow.
* Integration with cadastral datasets.
* Mobile application.

---

# 21. Long-Term Vision

The long-term vision is to create a **GIS decision-support platform for property division and land allocation**.

Instead of families arguing over static plans or simply comparing surface areas, the platform would allow them to interactively explore different possibilities and understand the consequences of every proposed boundary.

The core principle is:

> **Visualize → Divide → Measure → Compare → Discuss → Validate**

The platform should make land-division discussions more transparent by giving all participants access to the same geographic information, calculations, and proposed scenarios.

The final decision remains with the owners and the appropriate legal/cadastral professionals.
