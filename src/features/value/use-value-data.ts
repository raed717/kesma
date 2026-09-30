"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset, FrontageLine, Lot, OriginalParcel, ValueZone } from "@/domain/model/project";
import type { LotValue, ValueModel } from "@/domain/value";
import { useWorkspaceStore } from "@/store/workspace-store";

type ValueModule = typeof import("@/domain/value");

const NO_ZONES: ValueZone[] = [];
const NO_ASSETS: Asset[] = [];
const NO_FRONTAGE: FrontageLine[] = [];
const NO_PARCELS: OriginalParcel[] = [];

let modulePromise: Promise<ValueModule> | null = null;
/** Lazy-loads the value engine (it needs JSTS) once, shared by all hook instances. */
function loadValueModule() {
  modulePromise ??= import("@/domain/value");
  return modulePromise;
}

export type ValueData = {
  /** False until the engine is loaded or when the project has no value information. */
  enabled: boolean;
  model: ValueModel | null;
  propertyValue: number;
  lotValues: Map<string, LotValue>;
  currency: string;
};

/**
 * Value model of the active project and the values of the given lots. Lot values are
 * cached per geometry inside the model, so during a drag only changed lots are recomputed.
 */
export function useValueData(lots: Lot[]): ValueData {
  const settings = useWorkspaceStore((s) => s.project?.settings);
  const zones = useWorkspaceStore((s) => s.project?.valueZones ?? NO_ZONES);
  const assets = useWorkspaceStore((s) => s.project?.assets ?? NO_ASSETS);
  const frontage = useWorkspaceStore((s) => s.project?.frontageLines ?? NO_FRONTAGE);
  const parcels = useWorkspaceStore((s) => s.project?.property.parcels ?? NO_PARCELS);
  const [mod, setMod] = useState<ValueModule | null>(null);

  useEffect(() => {
    let alive = true;
    void loadValueModule().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, []);

  const hasValue = !!(mod && settings && mod.hasValueModel(settings, zones, assets));
  // Also built with frontage only: road access matters even without prices.
  const model = useMemo(() => {
    if (!mod || !settings || (!hasValue && frontage.length === 0)) return null;
    return mod.buildValueModel(settings, zones, assets, frontage);
  }, [mod, settings, hasValue, zones, assets, frontage]);
  const propertyValue = useMemo(
    () =>
      mod && model && hasValue
        ? mod.propertyValue(
            model,
            parcels.map((p) => p.geometry),
          )
        : 0,
    [mod, model, hasValue, parcels],
  );
  const lotValues = useMemo(
    () => (mod && model ? mod.computeLotValues(model, lots) : new Map<string, LotValue>()),
    [mod, model, lots],
  );

  return {
    enabled: hasValue,
    model,
    propertyValue,
    lotValues,
    currency: settings?.currency ?? "TND",
  };
}

/** "12 500 TND" — falls back to "12 500 XYZ" when the code is not a valid ISO currency. */
export function formatMoney(value: number, currency: string, locale: string): string {
  const text = (() => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} ${currency}`;
    }
  })();
  return locale.startsWith("ar") ? `⁦${text}⁩` : text;
}
