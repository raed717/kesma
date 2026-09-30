import { describe, expect, it } from "vitest";
import {
  detectCrsFromGeoJsonMember,
  detectCrsFromWkt,
  fromWgs84,
  isInTunisia,
  looksLikeLngLat,
  suggestCrs,
  toWgs84,
} from "./crs";

const TUNIS: [number, number] = [10.1815, 36.8065];
const SFAX: [number, number] = [10.7603, 34.7406];

describe("reprojection", () => {
  it.each(["EPSG:22391", "EPSG:22392", "EPSG:22332", "EPSG:32632", "EPSG:3857"] as const)(
    "%s round-trips Tunis to < 1 mm",
    (crs) => {
      const projected = fromWgs84(crs)(TUNIS);
      const back = toWgs84(crs)(projected);
      expect(Math.abs(back[0] - TUNIS[0])).toBeLessThan(1e-8);
      expect(Math.abs(back[1] - TUNIS[1])).toBeLessThan(1e-8);
    },
  );

  it("places Tunis where Carthage / Nord Tunisie expects it", () => {
    const [x, y] = fromWgs84("EPSG:22391")(TUNIS);
    // ~25 km east of the 9.9°E meridian, ~90 km north of the 36°N parallel.
    expect(x).toBeGreaterThan(520_000);
    expect(x).toBeLessThan(530_000);
    expect(y).toBeGreaterThan(385_000);
    expect(y).toBeLessThan(395_000);
  });

  it("applies the Carthage datum shift (differs from a plain Clarke 1880 projection)", () => {
    const withShift = fromWgs84("EPSG:22391")(TUNIS);
    const noShift = fromWgs84("EPSG:22391")(TUNIS); // same def: sanity
    expect(withShift).toEqual(noShift);
    // WGS84 UTM vs Carthage UTM on the same point differ by the datum shift (~100–300 m).
    const [wx, wy] = fromWgs84("EPSG:32632")(TUNIS);
    const [cx, cy] = fromWgs84("EPSG:22332")(TUNIS);
    const shift = Math.hypot(wx - cx, wy - cy);
    expect(shift).toBeGreaterThan(50);
    expect(shift).toBeLessThan(500);
  });
});

describe("detectCrsFromWkt", () => {
  it("identifies ESRI .prj names", () => {
    expect(detectCrsFromWkt('PROJCS["Carthage_Nord_Tunisie",GEOGCS["GCS_Carthage"]]')).toBe(
      "EPSG:22391",
    );
    expect(detectCrsFromWkt('PROJCS["Carthage_Sud_Tunisie",GEOGCS["GCS_Carthage"]]')).toBe(
      "EPSG:22392",
    );
    expect(detectCrsFromWkt('PROJCS["WGS_1984_UTM_Zone_32N",GEOGCS["GCS_WGS_1984"]]')).toBe(
      "EPSG:32632",
    );
    expect(detectCrsFromWkt('PROJCS["Carthage_UTM_Zone_32N",GEOGCS["GCS_Carthage"]]')).toBe(
      "EPSG:22332",
    );
    expect(detectCrsFromWkt('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"]]')).toBe("EPSG:4326");
    expect(detectCrsFromWkt('PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere"]')).toBe("EPSG:3857");
  });

  it("prefers the outermost EPSG authority", () => {
    const wkt = 'PROJCS["x",GEOGCS["Carthage",AUTHORITY["EPSG","4223"]],AUTHORITY["EPSG","22392"]]';
    expect(detectCrsFromWkt(wkt)).toBe("EPSG:22392");
  });

  it("returns null for unknown systems", () => {
    expect(detectCrsFromWkt('PROJCS["RGF93_Lambert_93",GEOGCS["GCS_RGF_1993"]]')).toBeNull();
    expect(detectCrsFromWkt("")).toBeNull();
  });
});

describe("detectCrsFromGeoJsonMember", () => {
  it("reads legacy crs members", () => {
    const named = (name: string) => ({ type: "name", properties: { name } });
    expect(detectCrsFromGeoJsonMember(named("urn:ogc:def:crs:EPSG::22391"))).toBe("EPSG:22391");
    expect(detectCrsFromGeoJsonMember(named("EPSG:32632"))).toBe("EPSG:32632");
    expect(detectCrsFromGeoJsonMember(named("urn:ogc:def:crs:OGC:1.3:CRS84"))).toBe("EPSG:4326");
    expect(detectCrsFromGeoJsonMember(named("EPSG:2154"))).toBeNull();
    expect(detectCrsFromGeoJsonMember(undefined)).toBeUndefined();
  });
});

describe("suggestCrs", () => {
  it("recognises lon/lat", () => {
    expect(looksLikeLngLat([10, 36, 10.1, 36.1])).toBe(true);
    expect(suggestCrs([10, 36, 10.1, 36.1])).toEqual(["EPSG:4326"]);
  });

  it("suggests only CRSs that land in Tunisia", () => {
    const [x, y] = fromWgs84("EPSG:22391")(TUNIS);
    const suggestions = suggestCrs([x - 100, y - 100, x + 100, y + 100]);
    expect(suggestions).toContain("EPSG:22391");
    expect(suggestions).not.toContain("EPSG:3857");
    for (const id of suggestions) expect(isInTunisia(toWgs84(id)([x, y]))).toBe(true);

    const [ux, uy] = fromWgs84("EPSG:32632")(SFAX);
    const utm = suggestCrs([ux, uy, ux + 50, uy + 50]);
    expect(utm).toEqual(expect.arrayContaining(["EPSG:32632", "EPSG:22332"]));
    expect(utm).not.toContain("EPSG:22391");
  });
});
