"use client";

import { Equal, Scale, UserPlus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBeneficiary } from "@/domain/model/factories";
import { formatFraction, formatPercent, nextBeneficiaryColor } from "@/domain/shares";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";
import { BeneficiaryEditor } from "./beneficiary-editor";
import { ShareSummary } from "./share-summary";
import { useShares } from "./use-shares";

export function BeneficiariesPanel() {
  const t = useTranslations("beneficiaries");
  const locale = useLocale();
  const update = useWorkspaceStore((s) => s.update);
  const areaUnit = useWorkspaceStore((s) => s.project?.settings.areaUnit ?? "ha");
  const { beneficiaries, propertyAreaM2, resolution } = useShares();
  const [openId, setOpenId] = useState<string | null>(null);

  function add() {
    const b = createBeneficiary({
      name: t("defaultName", { n: beneficiaries.length + 1 }),
      color: nextBeneficiaryColor(beneficiaries.map((x) => x.color)),
    });
    update((draft) => void draft.beneficiaries.push(b), { immediate: true });
    setOpenId(b.id);
  }

  function splitEqually() {
    update((draft) => {
      for (const b of draft.beneficiaries) b.share = { mode: "remainder", weight: 1 };
    });
  }

  if (beneficiaries.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <h3 className="mt-3 font-medium">{t("emptyTitle")}</h3>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("emptyBody")}</p>
        <Button size="sm" onClick={add}>
          <UserPlus /> {t("add")}
        </Button>
        <LegalNote />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-3 border-b p-4">
        <ShareSummary
          beneficiaries={beneficiaries}
          resolution={resolution}
          propertyAreaM2={propertyAreaM2}
          areaUnit={areaUnit}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={add}>
            <UserPlus /> {t("add")}
          </Button>
          {beneficiaries.length > 1 && (
            <Button size="sm" variant="outline" onClick={splitEqually}>
              <Equal /> {t("splitEqually")}
            </Button>
          )}
        </div>
      </div>

      <ul className="divide-y" aria-label={t("listLabel")}>
        {beneficiaries.map((b) => {
          const resolved = resolution.shares.get(b.id);
          const open = openId === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : b.id)}
                aria-expanded={open}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition-colors hover:bg-muted/60",
                  open && "bg-muted",
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`modeBadge.${b.share.mode}`, {
                      weight: b.share.mode === "remainder" ? b.share.weight : 0,
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-end tabular-nums">
                  <span className="block font-medium" data-testid="beneficiary-share">
                    {resolved
                      ? resolved.exact
                        ? `${formatFraction(resolved.exact)} · ${formatPercent(resolved.part, locale)}`
                        : formatPercent(resolved.part, locale)
                      : "—"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {resolved?.targetAreaM2 != null
                      ? formatArea(resolved.targetAreaM2, areaUnit, locale)
                      : ""}
                  </span>
                </span>
              </button>
              {open && (
                <BeneficiaryEditor
                  beneficiary={b}
                  resolved={resolved}
                  propertyAreaM2={propertyAreaM2}
                  areaUnit={areaUnit}
                  onDeleted={() => setOpenId(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-4 pb-4">
        <LegalNote />
      </div>
    </div>
  );
}

function LegalNote() {
  const t = useTranslations("beneficiaries");
  return (
    <p className="mt-6 flex items-start gap-1.5 text-start text-xs text-muted-foreground">
      <Scale className="mt-0.5 size-3.5 shrink-0" />
      {t("legalNote")}
    </p>
  );
}
