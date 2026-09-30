import Fraction from "fraction.js";
import type { Beneficiary, Share } from "./model/project";

/**
 * Share engine. Every beneficiary's share is resolved to a part of the whole property.
 *
 * Fractions and percentages are kept **exact** (rational arithmetic), so 1/3 + 1/3 + 1/3
 * is exactly 1 and 1/8 + 7/8 never drifts. Area-based shares depend on a measured
 * (floating-point) property area, so as soon as one is present the totals become
 * approximate and are compared with a small tolerance instead.
 */

export type ResolvedShare = {
  beneficiaryId: string;
  /** Exact part of the property, when computable exactly. */
  exact: Fraction | null;
  /** Part of the property in [0, 1+] as a number (always available when resolvable). */
  part: number;
  targetAreaM2: number | null;
};

export type ShareStatus =
  /** No beneficiaries yet. */
  | "empty"
  /** Shares add up to the whole property. */
  | "complete"
  /** Part of the property is not allocated to anyone. */
  | "under"
  /** Shares add up to more than the whole property. */
  | "over"
  /** Area-based shares need the property area, which is unknown (no parcels). */
  | "needsProperty"
  /** Some input is invalid (e.g. denominator 0). */
  | "invalid";

export type ShareResolution = {
  shares: Map<string, ResolvedShare>;
  status: ShareStatus;
  /** Sum of all parts (1 when complete). */
  total: number;
  totalExact: Fraction | null;
  /** 1 − total (negative when over-allocated). */
  gap: number;
  gapExact: Fraction | null;
  exact: boolean;
  /** Some beneficiaries take the remainder, but fixed shares leave nothing. */
  remainderStarved: boolean;
};

/** Relative tolerance used when area-based shares make the totals approximate. */
export const SHARE_EPSILON = 1e-9;

export function fixedShareFraction(share: Share): Fraction | null {
  switch (share.mode) {
    case "fraction":
      return share.denominator > 0 ? new Fraction(share.numerator, share.denominator) : null;
    case "percent":
      // String input makes fraction.js read the decimal exactly (33.33 → 3333/10000).
      return new Fraction(String(share.value)).div(100);
    default:
      return null;
  }
}

export function resolveShares(
  beneficiaries: Beneficiary[],
  propertyAreaM2: number,
): ShareResolution {
  const shares = new Map<string, ResolvedShare>();
  if (beneficiaries.length === 0) {
    return {
      shares,
      status: "empty",
      total: 0,
      totalExact: new Fraction(0),
      gap: 1,
      gapExact: new Fraction(1),
      exact: true,
      remainderStarved: false,
    };
  }

  const hasArea = propertyAreaM2 > 0;
  let invalid = false;
  let needsProperty = false;
  let exactSum = new Fraction(0); // fraction + percent
  let areaSum = 0; // area-based parts (approximate)
  let exact = true;
  let weightSum = 0;

  for (const b of beneficiaries) {
    const s = b.share;
    if (s.mode === "fraction" || s.mode === "percent") {
      const f = fixedShareFraction(s);
      if (!f) invalid = true;
      else exactSum = exactSum.add(f);
    } else if (s.mode === "area") {
      exact = false;
      if (!hasArea) needsProperty = true;
      else areaSum += s.m2 / propertyAreaM2;
    } else {
      weightSum += s.weight;
    }
  }

  if (invalid || needsProperty) {
    return {
      shares,
      status: invalid ? "invalid" : "needsProperty",
      total: NaN,
      totalExact: null,
      gap: NaN,
      gapExact: null,
      exact: false,
      remainderStarved: false,
    };
  }

  // What the fixed shares leave for "remainder" beneficiaries (never negative).
  const remainderExact = exact ? new Fraction(1).sub(exactSum) : null;
  const remainder = exact ? remainderExact!.valueOf() : 1 - exactSum.valueOf() - areaSum;
  const available = Math.max(0, remainder);
  const availableExact = remainderExact && remainderExact.gte(0) ? remainderExact : new Fraction(0);

  let totalExact: Fraction | null = exact ? new Fraction(0) : null;
  let total = 0;

  for (const b of beneficiaries) {
    const s = b.share;
    let part: number;
    let partExact: Fraction | null = null;
    if (s.mode === "fraction" || s.mode === "percent") {
      partExact = fixedShareFraction(s)!;
      part = partExact.valueOf();
    } else if (s.mode === "area") {
      part = s.m2 / propertyAreaM2;
    } else {
      if (exact) {
        partExact = availableExact
          .mul(new Fraction(String(s.weight)))
          .div(new Fraction(String(weightSum)));
        part = partExact.valueOf();
      } else {
        part = (available * s.weight) / weightSum;
      }
    }
    if (totalExact && partExact) totalExact = totalExact.add(partExact);
    total += part;
    shares.set(b.id, {
      beneficiaryId: b.id,
      exact: exact ? partExact : null,
      part,
      targetAreaM2: hasArea ? part * propertyAreaM2 : null,
    });
  }

  if (totalExact) total = totalExact.valueOf();
  const gapExact = totalExact ? new Fraction(1).sub(totalExact) : null;
  const gap = gapExact ? gapExact.valueOf() : 1 - total;

  let status: ShareStatus;
  if (gapExact) status = gapExact.equals(0) ? "complete" : gapExact.gt(0) ? "under" : "over";
  else status = Math.abs(gap) <= SHARE_EPSILON ? "complete" : gap > 0 ? "under" : "over";

  const remainderStarved =
    weightSum > 0 && (exact ? !availableExact.gt(0) : available <= SHARE_EPSILON);
  return { shares, status, total, totalExact, gap, gapExact, exact, remainderStarved };
}

/**
 * Expresses an already-resolved share in another input mode, so switching modes in the UI
 * keeps the same part of the property instead of resetting it.
 */
export function convertShare(
  mode: Share["mode"],
  resolved: Pick<ResolvedShare, "exact" | "part"> | undefined,
  propertyAreaM2: number,
): Share {
  const part = resolved && Number.isFinite(resolved.part) ? Math.max(0, resolved.part) : 0;
  switch (mode) {
    case "fraction": {
      const f = resolved?.exact ?? new Fraction(part).simplify(1e-6);
      const numerator = Number(f.n);
      const denominator = Number(f.d);
      return Number.isSafeInteger(numerator) &&
        Number.isSafeInteger(denominator) &&
        denominator <= 1e9
        ? { mode, numerator, denominator }
        : { mode, numerator: Math.round(part * 1e6), denominator: 1e6 };
    }
    case "percent":
      return { mode, value: Math.round(part * 100 * 1e4) / 1e4 };
    case "area":
      return { mode, m2: propertyAreaM2 > 0 ? Math.round(part * propertyAreaM2 * 100) / 100 : 0 };
    case "remainder":
      return { mode, weight: 1 };
  }
}

// ---------- input parsing & formatting ----------

/** Parses "7/24", "1", " 3 / 8 " into an integer fraction. Returns null if invalid. */
export function parseFractionInput(
  text: string,
): { numerator: number; denominator: number } | null {
  const m = text.trim().match(/^(\d{1,9})\s*(?:\/\s*(\d{1,9}))?$/);
  if (!m) return null;
  const numerator = Number(m[1]);
  const denominator = m[2] === undefined ? 1 : Number(m[2]);
  if (denominator === 0) return null;
  return { numerator, denominator };
}

/** "7/24", or "1" for a whole. */
export function formatFraction(f: Fraction): string {
  return f.toFraction(false);
}

export function formatPercent(part: number, locale = "fr", maxDecimals = 2): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: maxDecimals,
  }).format(part);
}

/** Human description of a share as entered, e.g. "1/8", "25 %", "2.5 ha", "reste × 2". */
export function shareInputSummary(share: Share): string {
  switch (share.mode) {
    case "fraction":
      return `${share.numerator}/${share.denominator}`;
    case "percent":
      return `${share.value} %`;
    case "area":
      return `${share.m2} m²`;
    case "remainder":
      return `× ${share.weight}`;
  }
}

// ---------- palette ----------

/** Distinct colours that stay readable on satellite imagery and streets. */
export const BENEFICIARY_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
  "#059669",
  "#e11d48",
  "#7c3aed",
] as const;

export function nextBeneficiaryColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (
    BENEFICIARY_COLORS.find((c) => !taken.has(c)) ??
    BENEFICIARY_COLORS[used.length % BENEFICIARY_COLORS.length]
  );
}
