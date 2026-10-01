import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { analyzeProject } from "@/domain/compare";
import { createBeneficiary, createParcel, createProject } from "@/domain/model/factories";
import { createLot, createScenario } from "@/domain/scenarios";
import { squarePolygon } from "@/test/fixtures";
import { buildGeoJsonExport } from "./geojson";
import { toCsv } from "./table";
import { columnName, escapeXml, sheetNames, toXlsx } from "./xlsx";

describe("toCsv", () => {
  it("quotes special cells, keeps numbers numeric and starts with a BOM", () => {
    const csv = toCsv({
      name: "t",
      columns: ["Name", "Area"],
      rows: [
        ['Lot "A", north', 0.1 + 0.2],
        ["أحمد", null],
        [" padded", true],
      ],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Name,Area",
      '"Lot ""A"", north",0.3',
      "أحمد,",
      '" padded",true',
      "",
    ]);
  });
});

describe("xlsx helpers", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("escapes XML and strips control characters", () => {
    expect(escapeXml('a<b & "c"\u0001')).toBe("a&lt;b &amp; &quot;c&quot;");
  });
  it("makes sheet names valid and unique", () => {
    const names = sheetNames([
      { name: "Scénario 1 · Allocation / final", columns: [], rows: [] },
      { name: "Scénario 1 · Allocation / final", columns: [], rows: [] },
      { name: "", columns: [], rows: [] },
    ]);
    expect(names[0]).toBe("Scénario 1 · Allocation   final");
    expect(names[1].length).toBeLessThanOrEqual(31);
    expect(names[1]).toMatch(/\(2\)$/);
    expect(names[2]).toBe("Sheet3");
  });

  it("writes a readable workbook (RTL, inline strings, numbers)", async () => {
    const blob = await toXlsx(
      [{ name: "التوزيع", columns: ["الاسم", "m²"], rows: [["فاطمة", 1234.5]] }],
      { rtl: true },
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
      ]),
    );
    const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<t xml:space="preserve">فاطمة</t>');
    expect(sheet).toContain('<c r="B2"><v>1234.5</v></c>');
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('name="التوزيع"');
  });
});

describe("buildGeoJsonExport", () => {
  it("exports parcels and lots with readable attributes", () => {
    const project = createProject({ name: "P" });
    const geometry = squarePolygon(100);
    project.property.parcels = [createParcel({ label: "Parcel 1", geometry })];
    const heir = createBeneficiary({ name: "Amira", color: "#2563eb" });
    project.beneficiaries = [heir];
    const scenario = createScenario({
      name: "S",
      lots: [createLot({ label: "Lot 1", geometry, beneficiaryId: heir.id })],
    });
    project.scenarios = [scenario];
    const analysis = analyzeProject(project).scenarios[0];
    const fc = buildGeoJsonExport(project, analysis);
    expect(fc.features.map((f) => f.properties!.kesma_layer)).toEqual(["parcel", "lot"]);
    expect(fc.features[1].properties).toMatchObject({
      label: "Lot 1",
      scenario: "S",
      beneficiary: "Amira",
      allocation_status: "ok",
      locked: false,
    });
    expect(Math.abs((fc.features[1].properties!.area_m2 as number) - 10_000)).toBeLessThan(50);
    expect(buildGeoJsonExport(project, null).features).toHaveLength(1);
  });
});
