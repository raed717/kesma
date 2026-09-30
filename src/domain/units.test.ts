import { describe, expect, it } from "vitest";
import { convertArea, formatArea, formatLength, toSquareMetres } from "./units";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("units", () => {
  it("converts between m², ares and hectares", () => {
    expect(convertArea(25_000, "ha")).toBe(2.5);
    expect(convertArea(25_000, "a")).toBe(250);
    expect(toSquareMetres(2.5, "ha")).toBe(25_000);
    expect(toSquareMetres(convertArea(1234.5, "a"), "a")).toBeCloseTo(1234.5);
  });

  it("formats areas with unit-specific precision", () => {
    expect(formatArea(24_500, "ha", "en")).toBe("2.4500 ha");
    expect(formatArea(24_500.4, "m2", "en")).toBe("24,500 m²");
    expect(nbsp(formatArea(24_500, "ha", "fr"))).toBe("2,4500 ha");
  });

  it("isolates quantities as left-to-right runs in Arabic", () => {
    expect(formatArea(24_500, "ha", "ar")).toMatch(/^⁦.+ ha⁩$/);
    expect(formatLength(532, "ar")).toMatch(/^⁦.+ m⁩$/);
  });

  it("formats lengths in m or km", () => {
    expect(formatLength(532.26, "en")).toBe("532.3 m");
    expect(formatLength(1532.26, "en")).toBe("1.532 km");
  });
});
