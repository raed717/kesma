"use client";

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Loader2,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMap } from "react-map-gl/maplibre";
import { fitToGeometries } from "@/components/map/fit";
import { Button } from "@/components/ui/button";
import type { AreaUnit, Beneficiary, Lot, Scenario } from "@/domain/model/project";
import type { ValidationIssue } from "@/domain/validation";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { BeneficiarySelect } from "./beneficiary-select";
import { assignLots } from "./scenario-state";
import { useLotActions } from "./use-lot-actions";
import { useValidation } from "./validation-runner";

type Props = { scenario: Scenario; beneficiaries: Beneficiary[]; areaUnit: AreaUnit };

export function ValidationView({ scenario, beneficiaries, areaUnit }: Props) {
  const t = useTranslations("scenarios.validation");
  const { result, pending } = useValidation(scenario.id);

  if (!result) {
    return (
      <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("checking")}
      </p>
    );
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  return (
    <div className={cn("space-y-4 p-4 transition-opacity", pending && "opacity-60")}>
      {result.status === "valid" ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> {t("allGood")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t(`intro.${result.status}`)}</p>
      )}

      {errors.length > 0 && (
        <IssueGroup
          title={t("errors", { count: errors.length })}
          issues={errors}
          scenario={scenario}
          beneficiaries={beneficiaries}
          areaUnit={areaUnit}
        />
      )}
      {warnings.length > 0 && (
        <IssueGroup
          title={t("warnings", { count: warnings.length })}
          issues={warnings}
          scenario={scenario}
          beneficiaries={beneficiaries}
          areaUnit={areaUnit}
        />
      )}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  ...rest
}: { title: string; issues: ValidationIssue[] } & Omit<Props, never>) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="space-y-2" aria-label={title}>
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueCard issue={issue} {...rest} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueCard({
  issue,
  scenario,
  beneficiaries,
  areaUnit,
}: { issue: ValidationIssue } & Props) {
  const t = useTranslations("scenarios.validation");
  const locale = useLocale();
  const { main: map } = useMap();
  const selectedId = useMapUiStore((s) => s.selectedIssueId);
  const selectIssue = useMapUiStore((s) => s.selectIssue);
  const actions = useLotActions(scenario.id);
  const lotName = (id: string) => scenario.lots.find((l) => l.id === id)?.label ?? "?";
  const lotOf = (id: string): Lot | undefined => scenario.lots.find((l) => l.id === id);
  const anyLocked = issue.lotIds.some((id) => lotOf(id)?.locked);

  function show() {
    selectIssue(issue.id);
    const geoms = issue.geometry ? [issue.geometry] : issue.lotIds.map((id) => lotOf(id)!.geometry);
    fitToGeometries(map, geoms, { maxZoom: issue.sliver ? 21 : 18 });
  }

  const Icon = issue.severity === "error" ? AlertOctagon : AlertTriangle;
  const [a, b] = issue.lotIds;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        issue.severity === "error" ? "border-red-500/40" : "border-amber-500/40",
        selectedId === issue.id && "ring-2 ring-ring/50",
      )}
      data-testid="validation-issue"
      data-kind={issue.kind}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            issue.severity === "error" ? "text-destructive" : "text-amber-600",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {t(`kinds.${issue.kind}`)}
            {issue.sliver && (
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                ({t("sliver")})
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              issue.lotIds.length > 0 ? issue.lotIds.map(lotName).join(" ↔ ") : null,
              issue.areaM2 !== undefined
                ? formatArea(issue.areaM2, issue.areaM2 < 100 ? "m2" : areaUnit, locale)
                : null,
              issue.detail ? t(`details.${issue.detail}`) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={t("show")} onClick={show}>
          <Crosshair />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {issue.kind === "gap" && issue.geometry && (
          <FixButton onClick={() => void actions.fixGap(issue.geometry!)}>
            {t("fix.absorbGap")}
          </FixButton>
        )}
        {issue.kind === "overlap" && a && b && (
          <>
            <FixButton disabled={lotOf(b)?.locked} onClick={() => void actions.fixOverlap(a, b)}>
              {t("fix.keepIn", { name: lotName(a) })}
            </FixButton>
            <FixButton disabled={lotOf(a)?.locked} onClick={() => void actions.fixOverlap(b, a)}>
              {t("fix.keepIn", { name: lotName(b) })}
            </FixButton>
          </>
        )}
        {issue.kind === "duplicate" && b && (
          <FixButton disabled={lotOf(b)?.locked} onClick={() => actions.remove([b])}>
            {t("fix.removeDuplicate", { name: lotName(b) })}
          </FixButton>
        )}
        {issue.kind === "outsideProperty" && a && (
          <FixButton disabled={anyLocked} onClick={() => void actions.fixOutside(a)}>
            {t("fix.clip")}
          </FixButton>
        )}
        {issue.kind === "invalidGeometry" && a && (
          <FixButton disabled={anyLocked} onClick={() => void actions.fixInvalid(a)}>
            {t("fix.repair")}
          </FixButton>
        )}
        {issue.kind === "unassigned" && a && beneficiaries.length > 0 && (
          <div className="w-full">
            <BeneficiarySelect
              aria-label={t("fix.assign", { name: lotName(a) })}
              beneficiaries={beneficiaries}
              value={null}
              onChange={(id) => id && assignLots(scenario.id, [a], id)}
            />
          </div>
        )}
        {issue.kind === "noLots" && (
          <p className="text-xs text-muted-foreground">{t("fix.noLots")}</p>
        )}
      </div>
    </div>
  );
}

function FixButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="xs" variant="outline" disabled={disabled} onClick={onClick}>
      <Wrench /> {children}
    </Button>
  );
}
