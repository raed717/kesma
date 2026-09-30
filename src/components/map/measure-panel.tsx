"use client";

import { Check, Trash2, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { pathLengthM, ringAreaM2, ringPerimeterM } from "@/domain/geometry/measure";
import type { AreaUnit } from "@/domain/model/project";
import { formatArea, formatLength } from "@/domain/units";
import { isMeasureTool, useMapUiStore } from "@/store/map-ui-store";

export function MeasurePanel({ areaUnit }: { areaUnit: AreaUnit }) {
  const t = useTranslations("map.measure");
  const locale = useLocale();
  const { tool, measurePoints, measureFinished, undoMeasurePoint, finishMeasure, clearMeasure } =
    useMapUiStore();

  if (!isMeasureTool(tool)) return null;
  const isArea = tool === "measure-area";
  const minPoints = isArea ? 3 : 2;
  const hasResult = measurePoints.length >= minPoints;

  return (
    <div className="w-64 rounded-xl border bg-background/95 p-3 text-sm shadow-md backdrop-blur">
      <p className="font-medium">{isArea ? t("areaTitle") : t("distanceTitle")}</p>
      {hasResult ? (
        <dl className="mt-2 space-y-1 tabular-nums">
          {isArea ? (
            <>
              <Row
                label={t("area")}
                value={formatArea(ringAreaM2(measurePoints), areaUnit, locale)}
              />
              <Row
                label={t("areaM2")}
                value={formatArea(ringAreaM2(measurePoints), "m2", locale)}
              />
              <Row
                label={t("perimeter")}
                value={formatLength(ringPerimeterM(measurePoints), locale)}
              />
            </>
          ) : (
            <Row label={t("distance")} value={formatLength(pathLengthM(measurePoints), locale)} />
          )}
        </dl>
      ) : (
        <p className="mt-1 text-muted-foreground">{isArea ? t("hintArea") : t("hintDistance")}</p>
      )}
      {measurePoints.length > 0 && (
        <div className="mt-3 flex gap-1">
          {!measureFinished && hasResult && (
            <Button size="sm" onClick={finishMeasure}>
              <Check /> {t("finish")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={undoMeasurePoint}>
            <Undo2 /> {t("undo")}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearMeasure}>
            <Trash2 /> {t("clear")}
          </Button>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("keys")}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
