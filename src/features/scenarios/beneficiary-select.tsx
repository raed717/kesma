"use client";

import { useTranslations } from "next-intl";
import type { Beneficiary } from "@/domain/model/project";

type Props = {
  beneficiaries: Beneficiary[];
  /** Current beneficiary id, null for "unassigned", undefined for a mixed selection. */
  value: string | null | undefined;
  onChange: (beneficiaryId: string | null) => void;
  id?: string;
  "aria-label"?: string;
};

/** Native select (accessible, works on touch) listing beneficiaries with their colour. */
export function BeneficiarySelect({ beneficiaries, value, onChange, id, ...aria }: Props) {
  const t = useTranslations("scenarios.assign");
  const current = beneficiaries.find((b) => b.id === value);
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-3 shrink-0 rounded-full border"
        style={current ? { backgroundColor: current.color, borderColor: current.color } : undefined}
        aria-hidden
      />
      <select
        id={id}
        // With an `id`, a visible <label htmlFor> names the select: don't override it.
        aria-label={aria["aria-label"] ?? (id ? undefined : t("select"))}
        value={value === undefined ? "__mixed" : (value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30"
      >
        {value === undefined && (
          <option value="__mixed" disabled>
            {t("mixed")}
          </option>
        )}
        <option value="">{t("none")}</option>
        {beneficiaries.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
