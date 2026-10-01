import { describe, expect, it } from "vitest";
import { ancestorChain, cropRect } from "./imagery-fallback";

describe("imagery fallback tile maths", () => {
  it("walks up the ancestors of a tile", () => {
    const chain = ancestorChain({ z: 20, y: 412_345, x: 553_210 }, 3);
    expect(chain).toEqual([
      { z: 20, y: 412_345, x: 553_210, dz: 0 },
      { z: 19, y: 206_172, x: 276_605, dz: 1 },
      { z: 18, y: 103_086, x: 138_302, dz: 2 },
      { z: 17, y: 51_543, x: 69_151, dz: 3 },
    ]);
  });

  it("stops at zoom 0", () => {
    expect(ancestorChain({ z: 1, y: 1, x: 0 }, 8).map((t) => t.z)).toEqual([1, 0]);
  });

  it("crops the right quarter of the parent", () => {
    // One level up: tile (x odd, y even) is the top-right quarter.
    expect(cropRect(5, 4, 1, 256)).toEqual({ sx: 128, sy: 0, sw: 128, sh: 128 });
    // Two levels up: 16 sub-squares of 64 px.
    expect(cropRect(7, 6, 2, 256)).toEqual({ sx: 192, sy: 128, sw: 64, sh: 64 });
    // Same level: the whole image.
    expect(cropRect(3, 3, 0, 256)).toEqual({ sx: 0, sy: 0, sw: 256, sh: 256 });
  });
});
