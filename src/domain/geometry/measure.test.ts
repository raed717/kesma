import { describe, expect, it } from "vitest";
import { squarePolygon } from "@/test/fixtures";
import {
  closeRing,
  geometryAreaM2,
  pathLengthM,
  ringAreaM2,
  ringPerimeterM,
  totalAreaM2,
} from "./measure";

describe("measure", () => {
  const square = squarePolygon(100);
  const ring = square.coordinates[0].slice(0, 4);

  it("computes the geodesic area of a 1 ha square within 0.5%", () => {
    expect(geometryAreaM2(square)).toBeCloseTo(10_000, -2);
    expect(Math.abs(geometryAreaM2(square) - 10_000) / 10_000).toBeLessThan(0.005);
  });

  it("sums areas", () => {
    expect(totalAreaM2([square, square])).toBeCloseTo(2 * geometryAreaM2(square), 6);
    expect(totalAreaM2([])).toBe(0);
  });

  it("measures an open ring like the closed polygon", () => {
    expect(ringAreaM2(ring)).toBeCloseTo(geometryAreaM2(square), 6);
    expect(ringPerimeterM(ring)).toBeGreaterThan(398);
    expect(ringPerimeterM(ring)).toBeLessThan(402);
  });

  it("measures path length in metres", () => {
    expect(pathLengthM(ring.slice(0, 2))).toBeGreaterThan(99.5);
    expect(pathLengthM(ring.slice(0, 2))).toBeLessThan(100.5);
  });

  it("returns 0 for degenerate input", () => {
    expect(pathLengthM([[10, 36]])).toBe(0);
    expect(ringAreaM2(ring.slice(0, 2))).toBe(0);
  });

  it("closes rings only when needed", () => {
    expect(closeRing(ring)).toHaveLength(5);
    expect(closeRing(square.coordinates[0])).toHaveLength(5);
    expect(closeRing([])).toEqual([]);
  });
});
