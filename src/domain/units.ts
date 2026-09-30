import type { AreaUnit } from "./model/project";

const M2_PER_UNIT: Record<AreaUnit, number> = { m2: 1, a: 100, ha: 10_000 };

export const AREA_UNIT_SYMBOL: Record<AreaUnit, string> = { m2: "m²", a: "a", ha: "ha" };

export function convertArea(m2: number, unit: AreaUnit): number {
  return m2 / M2_PER_UNIT[unit];
}

export function toSquareMetres(value: number, unit: AreaUnit): number {
  return value * M2_PER_UNIT[unit];
}

const AREA_DECIMALS: Record<AreaUnit, number> = { m2: 0, a: 2, ha: 4 };

export function formatArea(m2: number, unit: AreaUnit, locale = "fr"): string {
  const decimals = AREA_DECIMALS[unit];
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(convertArea(m2, unit));
  return isolateForRtl(`${value} ${AREA_UNIT_SYMBOL[unit]}`, locale);
}

/** Picks a readable unit automatically: m under 1 km, km above. */
export function formatLength(metres: number, locale = "fr"): string {
  const fmt = (v: number, d: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(v);
  return isolateForRtl(
    metres < 1000 ? `${fmt(metres, 1)} m` : `${fmt(metres / 1000, 3)} km`,
    locale,
  );
}

/**
 * In Arabic text, "10.5 ha" would be reordered to "ha 10.5". Wrapping the quantity in a
 * left-to-right isolate (LRI … PDI) keeps number and Latin unit together.
 */
function isolateForRtl(text: string, locale: string): string {
  return locale.startsWith("ar") ? `⁦${text}⁩` : text;
}
