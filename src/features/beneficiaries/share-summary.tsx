"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Beneficiary, AreaUnit } from "@/domain/model/project";
import { formatFraction, formatPercent, type ShareResolution } from "@/domain/shares";
import { formatArea } from "@/domain/units";
import { cn } from "@/lib/utils";

type Props = {
  beneficiaries: Beneficiary[];
  resolution: ShareResolution;
  propertyAreaM2: number;
  areaUnit: AreaUnit;
};

export function ShareSummary({ beneficiaries, resolution, propertyAreaM2, areaUnit }: Props) {
  const t = useTranslations("beneficiaries.summary");
  const locale = useLocale();
  const { status, gap, gapExact } = resolution;

  const gapLabel = () => {
    const abs = Math.abs(gap);
    const parts = [
      gapExact ? formatFraction(gapExact.abs()) : null,
      formatPercent(abs, locale),
      propertyAreaM2 > 0 ? formatArea(abs * propertyAreaM2, areaUnit, locale) : null,
    ];
    return parts.filter(Boolean).join(" · ");
  };

  const message =
    status === "complete"
      ? { tone: "ok" as const, text: t("complete") }
      : status === "under"
        ? { tone: "warn" as const, text: t("under", { gap: gapLabel() }) }
        : status === "over"
          ? { tone: "error" as const, text: t("over", { gap: gapLabel() }) }
          : status === "needsProperty"
            ? { tone: "warn" as const, text: t("needsProperty") }
            : status === "invalid"
              ? { tone: "error" as const, text: t("invalid") }
              : null;

  // Scale the bar to the total when over-allocated so every segment stays visible.
  const scale = Number.isFinite(resolution.total) ? Math.max(1, resolution.total) : 1;

  return (
    <div className="space-y-3">
      {Number.isFinite(resolution.total) && beneficiaries.length > 0 && (
        <div
          className={cn(
            "flex h-3 w-full overflow-hidden rounded-full bg-muted",
            status === "over" && "ring-2 ring-destructive/60",
          )}
          role="img"
          aria-label={t("barLabel")}
        >
          {beneficiaries.map((b) => {
            const part = resolution.shares.get(b.id)?.part ?? 0;
            return (
              <div
                key={b.id}
                title={`${b.name} · ${formatPercent(part, locale)}`}
                style={{ width: `${(part / scale) * 100}%`, backgroundColor: b.color }}
                className="h-full border-e border-background/70 last:border-e-0"
              />
            );
          })}
        </div>
      )}

      {message && (
        <p
          role="status"
          data-testid="share-status"
          className={cn(
            "flex items-start gap-1.5 text-sm",
            message.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
            message.tone === "warn" && "text-amber-700 dark:text-amber-400",
            message.tone === "error" && "text-destructive",
          )}
        >
          {message.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          {message.text}
        </p>
      )}

      {resolution.remainderStarved && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("remainderStarved")}
        </p>
      )}

      {propertyAreaM2 === 0 && status !== "needsProperty" && beneficiaries.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("noPropertyYet")}
        </p>
      )}
    </div>
  );
}
