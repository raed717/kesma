// @vitest-environment jsdom
// jsdom provides DOMParser for KML/GPX. Fixtures are the generated files in /samples.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { writePolygonShapefile } from "../../../scripts/lib/shapefile-writer.mjs";
import { fromWgs84 } from "../crs";
import { csvToLayer, guessCsvMapping, parseCsvTable, parseNumber } from "./parsers";
import { buildPreview, cleanGeometry, initialCrs, pickLabel, readImportFile } from "./pipeline";
import { ImportError } from "./types";

const SAMPLES = join(process.cwd(), "samples");
// Planar areas in EPSG:22391 printed by scripts/generate-samples.mjs.
const FARMLAND_M2 = 105_955;
const HOUSE_M2 = 3_006;

function sampleFile(name: string) {
  const buf = readFileSync(join(SAMPLES, name));
  return fileFromBytes(name, buf);
}

function fileFromBytes(name: string, bytes: Uint8Array | string) {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    size: data.byteLength,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  };
}

/** ±0.1% acceptance criterion from the sprint plan. */
function expectArea(actual: number, expected: number) {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(0.001);
}

async function previewOf(name: string) {
  const result = await readImportFile(sampleFile(name));
  if (result.kind !== "layer") throw new Error("expected a layer");
  const { crs } = initialCrs(result.layer);
  if (!crs) throw new Error("no crs");
  return { layer: result.layer, crs, preview: buildPreview(result.layer, crs) };
}

describe("import samples — every format lands on the same property", () => {
  it.each([
    "01-ben-ali-property.geojson",
    "02-ben-ali-property.kml",
    "03-ben-ali-property.kmz",
    "04-ben-ali-shapefile-carthage-nord.zip",
  ])("%s → 2 parcels with correct areas, in Tunisia", async (name) => {
    const { preview } = await previewOf(name);
    expect(preview.candidates).toHaveLength(2);
    expect(preview.inTunisia).toBe(true);
    expect(preview.warnings).toEqual([]);
    const [farm, house] = preview.candidates;
    expectArea(farm.areaM2, FARMLAND_M2);
    expectArea(house.areaM2, HOUSE_M2);
    expect(farm.selfIntersects).toBe(false);
  });

  it("reads the Shapefile .prj (Carthage / Nord Tunisie) and UTF-8 Arabic attributes", async () => {
    const { layer, crs, preview } = await previewOf("04-ben-ali-shapefile-carthage-nord.zip");
    expect(layer.crs).toEqual({ status: "known", crs: "EPSG:22391", source: "prj" });
    expect(crs).toBe("EPSG:22391");
    expect(preview.candidates[0].properties.NOM_AR).toBe("أرض فلاحية — هنشير");
    expect(preview.candidates[0].label).toBe("Terre agricole — Henchir");
  });

  it("shapefile and GeoJSON agree on position to < 0.5 m", async () => {
    const shp = (await previewOf("04-ben-ali-shapefile-carthage-nord.zip")).preview;
    const gj = (await previewOf("01-ben-ali-property.geojson")).preview;
    const a = (shp.candidates[0].geometry as GeoJSON.Polygon).coordinates[0];
    const b = (gj.candidates[0].geometry as GeoJSON.Polygon).coordinates[0];
    const toM = fromWgs84("EPSG:32632");
    // Rings may start at different vertices (orientation fix) — compare as sets.
    for (const p of a) {
      const nearest = Math.min(
        ...b.map((q) => Math.hypot(toM(p)[0] - toM(q)[0], toM(p)[1] - toM(q)[1])),
      );
      expect(nearest).toBeLessThan(0.5);
    }
  });

  it("CSV (semicolon + decimal comma) needs a CRS; EPSG:22391 is suggested", async () => {
    const result = await readImportFile(sampleFile("05-ben-ali-boundary-carthage-nord.csv"));
    expect(result.kind).toBe("table");
    if (result.kind !== "table") return;
    expect(result.table.delimiter).toBe(";");
    const mapping = guessCsvMapping(result.table.headers);
    expect(mapping).toEqual({ x: 1, y: 2, group: null });
    const layer = csvToLayer(result.table, { x: 1, y: 2, group: null });
    expect(layer.crs.status).toBe("unknown");
    const { crs, suggestions } = initialCrs(layer);
    expect(suggestions).toContain("EPSG:22391");
    const preview = buildPreview(layer, "EPSG:22391");
    expect(crs).not.toBeNull();
    expect(preview.candidates).toHaveLength(1);
    expectArea(preview.candidates[0].areaM2, FARMLAND_M2);
  });

  it("GPX track becomes a polygon, with a warning", async () => {
    const { preview } = await previewOf("06-ben-ali-boundary-walk.gpx");
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].fromLine).toBe(true);
    expect(preview.warnings).toContain("linesConvertedToPolygons");
    expect(Math.abs(preview.candidates[0].areaM2 - FARMLAND_M2) / FARMLAND_M2).toBeLessThan(0.01);
  });
});

describe("GeoJSON edge cases", () => {
  it("accepts a bare geometry and a single feature", async () => {
    const poly = {
      type: "Polygon",
      coordinates: [
        [
          [10, 36],
          [10.001, 36],
          [10.001, 36.001],
          [10, 36],
        ],
      ],
    };
    for (const body of [poly, { type: "Feature", properties: { nom: "A" }, geometry: poly }]) {
      const r = await readImportFile(fileFromBytes("x.geojson", JSON.stringify(body)));
      if (r.kind !== "layer") throw new Error();
      expect(buildPreview(r.layer, "EPSG:4326").candidates).toHaveLength(1);
    }
  });

  it("detects projected coordinates in a GeoJSON without crs member", async () => {
    const [x, y] = fromWgs84("EPSG:22391")([10.2, 36.7]);
    const body = {
      type: "Polygon",
      coordinates: [
        [
          [x, y],
          [x + 100, y],
          [x + 100, y + 100],
          [x, y + 100],
          [x, y],
        ],
      ],
    };
    const r = await readImportFile(fileFromBytes("p.geojson", JSON.stringify(body)));
    if (r.kind !== "layer") throw new Error();
    const { crs, suggestions } = initialCrs(r.layer);
    expect(crs).not.toBe("EPSG:4326");
    expect(suggestions).toContain("EPSG:22391");
    expectArea(buildPreview(r.layer, "EPSG:22391").candidates[0].areaM2, 10_000 / 0.999625544 ** 2);
  });

  it("counts skipped points and flags self-intersections", async () => {
    const bowtie = {
      type: "Polygon",
      coordinates: [
        [
          [10, 36],
          [10.001, 36.001],
          [10.001, 36],
          [10, 36.001],
          [10, 36],
        ],
      ],
    };
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [10, 36] } },
        { type: "Feature", properties: {}, geometry: bowtie },
      ],
    };
    const r = await readImportFile(fileFromBytes("b.geojson", JSON.stringify(fc)));
    if (r.kind !== "layer") throw new Error();
    const preview = buildPreview(r.layer, "EPSG:4326");
    expect(preview.skipped.points).toBe(1);
    expect(preview.warnings).toEqual(
      expect.arrayContaining(["pointsSkipped", "selfIntersections"]),
    );
  });
});

describe("errors", () => {
  it.each([
    ["x.geojson", "{nope", "invalidJson"],
    ["x.geojson", '{"type":"Banana"}', "invalidGeoJson"],
    ["x.kml", "<kml><unclosed>", "invalidXml"],
    ["x.shp", "abc", "shpNotZipped"],
    ["x.pdf", "abc", "unsupportedFormat"],
    ["x.csv", "only-header", "csvNoRows"],
  ])("%s %s → %s", async (name, content, code) => {
    await expect(readImportFile(fileFromBytes(name, content))).rejects.toMatchObject({ code });
  });

  it("rejects empty files and zips without .shp", async () => {
    await expect(readImportFile(fileFromBytes("e.geojson", ""))).rejects.toMatchObject({
      code: "emptyFile",
    });
    const zip = new JSZip();
    zip.file("readme.txt", "hi");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(readImportFile(fileFromBytes("a.zip", bytes))).rejects.toBeInstanceOf(ImportError);
  });

  it("shapefile without .prj is 'unknown' and gets suggestions", async () => {
    const [x, y] = fromWgs84("EPSG:22391")([10.2, 36.7]);
    const shp = writePolygonShapefile(
      [
        {
          rings: [
            [
              [x, y],
              [x + 50, y],
              [x + 50, y + 50],
              [x, y + 50],
            ],
          ],
          properties: { NOM: "A" },
        },
      ],
      ["NOM"],
    );
    const zip = new JSZip();
    zip.file("a.shp", shp.shp);
    zip.file("a.dbf", shp.dbf);
    const r = await readImportFile(
      fileFromBytes("a.zip", await zip.generateAsync({ type: "uint8array" })),
    );
    if (r.kind !== "layer") throw new Error();
    expect(r.layer.crs.status).toBe("unknown");
    expect(initialCrs(r.layer).suggestions).toContain("EPSG:22391");
  });
});

describe("helpers", () => {
  it("parses European and plain numbers", () => {
    expect(parseNumber("10,5")).toBe(10.5);
    expect(parseNumber("10.5")).toBe(10.5);
    expect(parseNumber("534 496,25")).toBe(534496.25);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("abc")).toBeNaN();
  });

  it("groups CSV rows into several polygons", () => {
    const table = parseCsvTable(
      "parcelle,lon,lat\nA,10,36\nA,10.001,36\nA,10.001,36.001\nB,10.01,36\nB,10.011,36\nB,10.011,36.001\n",
      "t.csv",
    );
    const mapping = guessCsvMapping(table.headers);
    expect(mapping).toEqual({ x: 1, y: 2, group: 0 });
    const layer = csvToLayer(table, { x: 1, y: 2, group: 0 });
    expect(layer.features.map((f) => f.properties?.name)).toEqual(["A", "B"]);
  });

  it("cleans geometries", () => {
    expect(
      cleanGeometry({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
      }),
    ).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
    expect(
      cleanGeometry({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });

  it("picks labels from common attribute names", () => {
    expect(pickLabel({ NOM: "Henchir" })).toBe("Henchir");
    expect(pickLabel({ id: 12 })).toBe("12");
    expect(pickLabel({ foo: "bar" })).toBeNull();
  });
});
