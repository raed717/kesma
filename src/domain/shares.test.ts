import { describe, expect, it } from "vitest";
import { createBeneficiary } from "./model/factories";
import type { Beneficiary, Share } from "./model/project";
import {
  formatFraction,
  nextBeneficiaryColor,
  parseFractionInput,
  resolveShares,
  BENEFICIARY_COLORS,
} from "./shares";

const HA10 = 100_000; // 10 ha in m²
let n = 0;
const heir = (share: Share, name = `H${++n}`): Beneficiary =>
  createBeneficiary({ name, color: "#2563eb", share }, { id: () => name });

const frac = (numerator: number, denominator: number): Share => ({
  mode: "fraction",
  numerator,
  denominator,
});
const pct = (value: number): Share => ({ mode: "percent", value });
const area = (m2: number): Share => ({ mode: "area", m2 });
const rest = (weight = 1): Share => ({ mode: "remainder", weight });

describe("resolveShares — exact arithmetic", () => {
  it("1/8 + 7/8 is exactly complete", () => {
    const r = resolveShares([heir(frac(1, 8)), heir(frac(7, 8))], HA10);
    expect(r.status).toBe("complete");
    expect(r.exact).toBe(true);
    expect(r.totalExact!.equals(1)).toBe(true);
  });

  it("three thirds are exactly 1 (no 0.9999… drift)", () => {
    const r = resolveShares([heir(frac(1, 3)), heir(frac(1, 3)), heir(frac(1, 3))], HA10);
    expect(r.status).toBe("complete");
    expect(r.gapExact!.equals(0)).toBe(true);
  });

  it("the context example 25/25/30/20 % gives 2.5/2.5/3/2 ha", () => {
    const hs = [heir(pct(25), "A"), heir(pct(25), "B"), heir(pct(30), "C"), heir(pct(20), "D")];
    const r = resolveShares(hs, HA10);
    expect(r.status).toBe("complete");
    expect(hs.map((h) => r.shares.get(h.id)!.targetAreaM2)).toEqual([
      25_000, 25_000, 30_000, 20_000,
    ]);
  });

  it("reads decimal percentages exactly", () => {
    const r = resolveShares([heir(pct(33.33)), heir(pct(66.67))], HA10);
    expect(r.status).toBe("complete");
    expect(formatFraction(r.shares.get("H" + (n - 1))!.exact!)).toBe("3333/10000");
  });

  it("mixes fractions and percentages exactly", () => {
    const r = resolveShares([heir(frac(1, 4)), heir(pct(75))], HA10);
    expect(r.status).toBe("complete");
  });

  it("reports what is missing or exceeded, exactly", () => {
    const under = resolveShares([heir(frac(1, 2)), heir(frac(1, 3))], HA10);
    expect(under.status).toBe("under");
    expect(formatFraction(under.gapExact!)).toBe("1/6");

    const over = resolveShares([heir(frac(2, 3)), heir(frac(1, 2))], HA10);
    expect(over.status).toBe("over");
    expect(formatFraction(over.gapExact!.neg())).toBe("1/6");
  });
});

describe("resolveShares — remainder (residual heirs)", () => {
  it("N heirs with default shares split equally", () => {
    const hs = [1, 2, 3, 4].map(() =>
      createBeneficiary({ name: "x", color: "#000000" }, { id: () => `r${++n}` }),
    );
    const r = resolveShares(hs, HA10);
    expect(r.status).toBe("complete");
    for (const h of hs) expect(formatFraction(r.shares.get(h.id)!.exact!)).toBe("1/4");
  });

  it("spouse 1/8, then 2 sons and 1 daughter (2:2:1) — classic case", () => {
    const wife = heir(frac(1, 8), "wife");
    const son1 = heir(rest(2), "son1");
    const son2 = heir(rest(2), "son2");
    const daughter = heir(rest(1), "daughter");
    const r = resolveShares([wife, son1, son2, daughter], HA10);
    expect(r.status).toBe("complete");
    expect(r.exact).toBe(true);
    // Remainder 7/8 split into 5 parts: 7/40 per part.
    expect(formatFraction(r.shares.get("son1")!.exact!)).toBe("7/20");
    expect(formatFraction(r.shares.get("son2")!.exact!)).toBe("7/20");
    expect(formatFraction(r.shares.get("daughter")!.exact!)).toBe("7/40");
    expect(r.shares.get("daughter")!.targetAreaM2).toBeCloseTo(17_500, 6);
  });

  it("flags remainder heirs that receive nothing", () => {
    const r = resolveShares([heir(frac(1, 1)), heir(rest())], HA10);
    expect(r.status).toBe("complete");
    expect(r.remainderStarved).toBe(true);
  });

  it("over-allocated fixed shares do not give negative remainders", () => {
    const r = resolveShares([heir(frac(3, 2)), heir(rest())], HA10);
    expect(r.status).toBe("over");
    expect(r.shares.get("H" + n)!.part).toBe(0);
  });
});

describe("resolveShares — area-based shares", () => {
  it("converts target areas and compares with a tolerance", () => {
    const r = resolveShares([heir(area(30_000)), heir(rest())], HA10);
    expect(r.exact).toBe(false);
    expect(r.status).toBe("complete");
    expect(r.shares.get("H" + n)!.targetAreaM2).toBeCloseTo(70_000, 6);
  });

  it("needs the property area", () => {
    expect(resolveShares([heir(area(1000))], 0).status).toBe("needsProperty");
  });

  it("detects shortfall with area shares", () => {
    const r = resolveShares([heir(area(30_000)), heir(area(50_000))], HA10);
    expect(r.status).toBe("under");
    expect(r.gap).toBeCloseTo(0.2, 9);
  });
});

describe("resolveShares — edge cases", () => {
  it("empty list", () => {
    expect(resolveShares([], HA10).status).toBe("empty");
  });

  it("invalid denominator", () => {
    expect(resolveShares([heir(frac(1, 0))], HA10).status).toBe("invalid");
  });

  it("no property: fractions still resolve, targets are null", () => {
    const r = resolveShares([heir(frac(1, 2)), heir(frac(1, 2))], 0);
    expect(r.status).toBe("complete");
    expect(r.shares.get("H" + n)!.targetAreaM2).toBeNull();
  });
});

describe("convertShare", () => {
  it("keeps the same part when switching modes", async () => {
    const { convertShare } = await import("./shares");
    const r = resolveShares([heir(frac(1, 8), "w"), heir(rest(2), "s"), heir(rest(1), "d")], HA10);
    const d = r.shares.get("d")!; // 7/24
    expect(convertShare("fraction", d, HA10)).toEqual({
      mode: "fraction",
      numerator: 7,
      denominator: 24,
    });
    expect(convertShare("percent", d, HA10)).toEqual({ mode: "percent", value: 29.1667 });
    expect(convertShare("area", d, HA10)).toEqual({ mode: "area", m2: 29166.67 });
    expect(convertShare("remainder", d, HA10)).toEqual({ mode: "remainder", weight: 1 });
    // Approximate parts become a simple fraction.
    expect(convertShare("fraction", { exact: null, part: 0.25 }, HA10)).toEqual({
      mode: "fraction",
      numerator: 1,
      denominator: 4,
    });
    expect(convertShare("area", d, 0)).toEqual({ mode: "area", m2: 0 });
  });
});

describe("helpers", () => {
  it("parses fraction input", () => {
    expect(parseFractionInput("7/24")).toEqual({ numerator: 7, denominator: 24 });
    expect(parseFractionInput(" 3 / 8 ")).toEqual({ numerator: 3, denominator: 8 });
    expect(parseFractionInput("1")).toEqual({ numerator: 1, denominator: 1 });
    expect(parseFractionInput("1/0")).toBeNull();
    expect(parseFractionInput("-1/2")).toBeNull();
    expect(parseFractionInput("0.5")).toBeNull();
    expect(parseFractionInput("abc")).toBeNull();
  });

  it("assigns distinct colours, then cycles", () => {
    expect(nextBeneficiaryColor([])).toBe(BENEFICIARY_COLORS[0]);
    expect(nextBeneficiaryColor([BENEFICIARY_COLORS[0]])).toBe(BENEFICIARY_COLORS[1]);
    expect(nextBeneficiaryColor([...BENEFICIARY_COLORS])).toBe(BENEFICIARY_COLORS[0]);
  });
});
