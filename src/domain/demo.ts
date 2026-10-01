// Sample "try a demo" project (auto-split needs JSTS: import lazily from the UI).
import { autoSplit } from "./autosplit";
import type { LineString, Polygon, Position } from "./model/geojson";
import {
  createBeneficiary,
  createParcel,
  createProject,
  newId,
  type FactoryDeps,
} from "./model/factories";
import type { Project } from "./model/project";
import { lotsFromParcels, createScenario } from "./scenarios";
import { resolveShares } from "./shares";
import { totalAreaM2 } from "./geometry/measure";
import { buildValueModel } from "./value";

/** Localised texts of the demo (names of people, parcels, scenarios…). */
export type DemoLabels = {
  projectName: string;
  description: string;
  parcels: [string, string];
  heirs: { name: string; notes: string }[];
  zone: string;
  well: string;
  orchard: string;
  road: string;
  lotPrefix: string;
  scenarios: { area: string; value: string; parcels: string };
};

// Farmland in Cap Bon (Tunisia). Shapes are given in metres east/north of this origin.
const ORIGIN: Position = [10.5552, 36.6542];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN[1] * Math.PI) / 180);

const at = ([x, y]: [number, number]): Position => [
  +(ORIGIN[0] + x / M_PER_DEG_LON).toFixed(8),
  +(ORIGIN[1] + y / M_PER_DEG_LAT).toFixed(8),
];
const polygon = (pts: [number, number][]): Polygon => ({
  type: "Polygon",
  coordinates: [[...pts, pts[0]].map(at)],
});
const line = (pts: [number, number][]): LineString => ({
  type: "LineString",
  coordinates: pts.map(at),
});

/** Two neighbouring parcels (shared edge), four heirs, value zone, assets, road, 3 scenarios. */
export function buildDemoProject(labels: DemoLabels, deps: FactoryDeps = {}): Project {
  const project = createProject(
    {
      name: labels.projectName,
      description: labels.description,
      settings: { areaUnit: "ha", currency: "TND", areaTolerancePct: 1, baseValuePerM2: 30 },
    },
    deps,
  );

  project.property.parcels = [
    createParcel(
      {
        label: labels.parcels[0],
        geometry: polygon([
          [0, 0],
          [150, -8],
          [162, 205],
          [-6, 198],
        ]),
        attributes: { landUse: "agricultural", irrigation: true, waterAccess: true },
        source: { format: "drawn" },
      },
      deps,
    ),
    createParcel(
      {
        label: labels.parcels[1],
        geometry: polygon([
          [150, -8],
          [258, 0],
          [250, 150],
          [162, 205],
        ]),
        attributes: { landUse: "agricultural", roadAccess: true },
        source: { format: "drawn" },
      },
      deps,
    ),
  ];

  // A spouse with a fixed 1/8, children sharing the rest 2:2:1 (example only).
  const colors = ["#db2777", "#2563eb", "#16a34a", "#ea580c"];
  const shares = [
    { mode: "fraction", numerator: 1, denominator: 8 },
    { mode: "remainder", weight: 2 },
    { mode: "remainder", weight: 2 },
    { mode: "remainder", weight: 1 },
  ] as const;
  project.beneficiaries = labels.heirs
    .slice(0, 4)
    .map((h, i) =>
      createBeneficiary({ name: h.name, notes: h.notes, color: colors[i], share: shares[i] }, deps),
    );

  project.valueZones = [
    {
      id: newId(deps),
      name: labels.zone,
      color: "#0891b2",
      mode: "multiplier",
      value: 1.6,
      geometry: polygon([
        [-20, 120],
        [175, 120],
        [175, 230],
        [-20, 230],
      ]),
    },
  ];
  project.assets = [
    {
      id: newId(deps),
      name: labels.well,
      kind: "well",
      value: 15000,
      geometry: { type: "Point", coordinates: at([60, 160]) },
    },
    {
      id: newId(deps),
      name: labels.orchard,
      kind: "trees",
      value: 24000,
      geometry: polygon([
        [180, 30],
        [240, 30],
        [238, 100],
        [178, 100],
      ]),
    },
  ];
  // Along the southern boundary (on its vertices), slightly beyond both ends.
  project.frontageLines = [
    {
      id: newId(deps),
      name: labels.road,
      geometry: line([
        [-15, 0.8],
        [0, 0],
        [150, -8],
        [258, 0],
        [268.8, 0.8],
      ]),
    },
  ];

  const parcels = project.property.parcels.map((p) => p.geometry);
  const resolution = resolveShares(project.beneficiaries, totalAreaM2(parcels));
  const parts = project.beneficiaries.map((b) => ({
    beneficiaryId: b.id,
    part: resolution.shares.get(b.id)?.part ?? 0,
  }));
  const model = buildValueModel(
    project.settings,
    project.valueZones,
    project.assets,
    project.frontageLines,
  );
  // North–south cut lines: every strip reaches the road on the south side.
  const byArea = autoSplit({
    parcels,
    bearingDeg: 0,
    parts,
    mode: "area",
    lotPrefix: labels.lotPrefix,
  });
  const byValue = autoSplit({
    parcels,
    bearingDeg: 0,
    parts,
    mode: "value",
    model,
    lotPrefix: labels.lotPrefix,
  });

  const fromParcels = lotsFromParcels(project.property.parcels, labels.lotPrefix);
  fromParcels.forEach((lot, i) => (lot.beneficiaryId = project.beneficiaries[i + 1]?.id ?? null));

  project.scenarios = [
    ...(byArea.ok
      ? [
          {
            ...createScenario(
              { name: labels.scenarios.area, lots: byArea.lots, method: "autosplit-area" },
              deps,
            ),
            status: "proposed" as const,
          },
        ]
      : []),
    ...(byValue.ok
      ? [
          createScenario(
            { name: labels.scenarios.value, lots: byValue.lots, method: "autosplit-value" },
            deps,
          ),
        ]
      : []),
    createScenario({ name: labels.scenarios.parcels, lots: fromParcels }, deps),
  ];
  return project;
}
