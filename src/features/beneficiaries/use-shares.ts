"use client";

import { useMemo } from "react";
import { totalAreaM2 } from "@/domain/geometry/measure";
import type { Beneficiary, OriginalParcel } from "@/domain/model/project";
import { resolveShares } from "@/domain/shares";
import { useWorkspaceStore } from "@/store/workspace-store";

const NO_BENEFICIARIES: Beneficiary[] = [];
const NO_PARCELS: OriginalParcel[] = [];

/** Beneficiaries of the active project with their resolved shares and target areas. */
export function useShares() {
  const beneficiaries = useWorkspaceStore((s) => s.project?.beneficiaries ?? NO_BENEFICIARIES);
  const parcels = useWorkspaceStore((s) => s.project?.property.parcels ?? NO_PARCELS);
  const propertyAreaM2 = useMemo(() => totalAreaM2(parcels.map((p) => p.geometry)), [parcels]);
  const resolution = useMemo(
    () => resolveShares(beneficiaries, propertyAreaM2),
    [beneficiaries, propertyAreaM2],
  );
  return { beneficiaries, propertyAreaM2, resolution };
}
