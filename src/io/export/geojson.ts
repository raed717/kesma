import type { ScenarioAnalysis } from "@/domain/compare";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import type { Project } from "@/domain/model/project";
import { round } from "./table";

/** Feature kind, in the `kesma_layer` property (filter on it in QGIS / ArcGIS). */
export type ExportLayer = "parcel" | "lot" | "valueZone" | "asset" | "frontage";

type Feature = GeoJSON.Feature<
  GeoJSON.Geometry,
  Record<string, unknown> & { kesma_layer: ExportLayer }
>;

/**
 * Property, value layers and (optionally) one scenario's lots as a single WGS84
 * FeatureCollection, with readable attributes on every feature.
 */
export function buildGeoJsonExport(
  project: Project,
  scenario: ScenarioAnalysis | null,
): GeoJSON.FeatureCollection {
  const names = new Map(project.beneficiaries.map((b) => [b.id, b.name]));
  const features: Feature[] = [];

  for (const p of project.property.parcels) {
    features.push({
      type: "Feature",
      id: p.id,
      geometry: p.geometry,
      properties: {
        kesma_layer: "parcel",
        id: p.id,
        label: p.label,
        area_m2: round(geometryAreaM2(p.geometry), 2),
        ...p.attributes,
      },
    });
  }

  if (scenario) {
    const s = scenario.scenario;
    const byLot = new Map(
      scenario.allocation.rows.flatMap((r) => r.lotIds.map((id) => [id, r] as const)),
    );
    for (const lot of s.lots) {
      const value = scenario.lotValues.get(lot.id);
      const known = lot.beneficiaryId && names.has(lot.beneficiaryId) ? lot.beneficiaryId : null;
      features.push({
        type: "Feature",
        id: lot.id,
        geometry: lot.geometry,
        properties: {
          kesma_layer: "lot",
          id: lot.id,
          label: lot.label,
          scenario: s.name,
          scenario_id: s.id,
          beneficiary: known ? names.get(known)! : null,
          beneficiary_id: known,
          area_m2: round(geometryAreaM2(lot.geometry), 2),
          ...(value && {
            value: round(value.total, 2),
            frontage_m: round(value.frontageM, 2),
            road_access: value.roadAccess,
          }),
          locked: lot.locked,
          allocation_status: (known && byLot.get(lot.id)?.status) || null,
          ...(lot.notes && { notes: lot.notes }),
        },
      });
    }
  }

  for (const z of project.valueZones) {
    features.push({
      type: "Feature",
      id: z.id,
      geometry: z.geometry,
      properties: {
        kesma_layer: "valueZone",
        id: z.id,
        name: z.name,
        mode: z.mode,
        value: z.value,
        currency: project.settings.currency,
        color: z.color,
      },
    });
  }
  for (const a of project.assets) {
    features.push({
      type: "Feature",
      id: a.id,
      geometry: a.geometry,
      properties: {
        kesma_layer: "asset",
        id: a.id,
        name: a.name,
        kind: a.kind,
        value: a.value,
        currency: project.settings.currency,
      },
    });
  }
  for (const f of project.frontageLines) {
    features.push({
      type: "Feature",
      id: f.id,
      geometry: f.geometry,
      properties: { kesma_layer: "frontage", id: f.id, name: f.name },
    });
  }

  return { type: "FeatureCollection", features };
}
