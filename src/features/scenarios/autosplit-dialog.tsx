"use client";

import { ArrowDown, ArrowUp, Loader2, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { longestEdgeBearing, perpendicularBearing } from "@/domain/geometry/bearing";
import type { Position } from "@/domain/model/geojson";
import { createScenario } from "@/domain/scenarios";
import { formatPercent } from "@/domain/shares";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useShares } from "../beneficiaries/use-shares";
import { useValueData } from "../value/use-value-data";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function AutoSplitDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {/* Remounts on each open: fresh settings every time. */}
        <AutoSplitForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const NO_LOTS: never[] = [];

function AutoSplitForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("autosplit");
  const locale = useLocale();
  const ids = useId();
  const project = useWorkspaceStore((s) => s.project);
  const update = useWorkspaceStore((s) => s.update);
  const setActiveScenario = useMapUiStore((s) => s.setActiveScenario);
  const { beneficiaries, resolution } = useShares();
  const value = useValueData(NO_LOTS);
  const parcels = useMemo(() => project?.property.parcels.map((p) => p.geometry) ?? [], [project]);
  const frontage = project?.frontageLines ?? [];

  const eligible = beneficiaries.filter((b) => (resolution.shares.get(b.id)?.part ?? 0) > 0);
  const [order, setOrder] = useState(() => eligible.map((b) => b.id));
  const [mode, setMode] = useState<"area" | "value">("area");
  const [bearing, setBearing] = useState(0);
  const [running, setRunning] = useState(false);
  const [name, setName] = useState("");

  type Preset = { key: "northSouth" | "eastWest" | "longestEdge" | "road"; bearing: number };
  const presets: Preset[] = [
    { key: "northSouth", bearing: 0 },
    { key: "eastWest", bearing: 90 },
    ...(parcels.length
      ? [{ key: "longestEdge" as const, bearing: Math.round(longestEdgeBearing(parcels)) }]
      : []),
    ...(frontage.length
      ? [
          {
            key: "road" as const,
            bearing: Math.round(perpendicularBearing(frontage[0].geometry.coordinates)),
          },
        ]
      : []),
  ];

  const blocked =
    parcels.length === 0
      ? t("errors.noProperty")
      : eligible.length === 0
        ? t("errors.noShares")
        : resolution.status === "invalid" ||
            resolution.status === "needsProperty" ||
            resolution.status === "over"
          ? t("errors.shares")
          : null;

  const move = (i: number, d: number) =>
    setOrder((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function run() {
    if (!project || blocked) return;
    setRunning(true);
    try {
      const [{ autoSplit }, valueMod] = await Promise.all([
        import("@/domain/autosplit"),
        import("@/domain/value"),
      ]);
      const model =
        mode === "value"
          ? valueMod.buildValueModel(
              project.settings,
              project.valueZones,
              project.assets,
              project.frontageLines,
            )
          : undefined;
      // Let the spinner paint before the (synchronous) computation.
      await new Promise((r) => setTimeout(r, 30));
      const result = autoSplit({
        parcels,
        bearingDeg: bearing,
        parts: order.map((id) => ({
          beneficiaryId: id,
          part: resolution.shares.get(id)?.part ?? 0,
        })),
        mode,
        model,
        lotPrefix: t("lotPrefix"),
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.reason}`));
        return;
      }
      const scenario = createScenario({
        name: name.trim() || t(`defaultName.${mode}`),
        lots: result.lots,
        method: mode === "area" ? "autosplit-area" : "autosplit-value",
      });
      update((d) => void d.scenarios.push(scenario), { immediate: true });
      setActiveScenario(scenario.id);
      useMapUiStore.setState({ scenarioView: "allocation" });
      const worst = Math.max(
        ...result.achieved.map((a) =>
          a.target > 0 ? Math.abs(a.measure - a.target) / a.target : 0,
        ),
      );
      toast.success(t("done", { deviation: formatPercent(worst, locale, 3) }));
      onDone();
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      {blocked ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
          {blocked}
        </p>
      ) : (
        <div className="space-y-5 text-sm">
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">{t("mode")}</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["area", "value"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={m === "value" && !value.enabled}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    mode === m
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`modes.${m}`)}
                </button>
              ))}
            </div>
            {!value.enabled && (
              <p className="text-xs text-muted-foreground">{t("valueNeedsModel")}</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">{t("direction")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <Button
                  key={p.key}
                  size="xs"
                  variant={bearing === p.bearing ? "secondary" : "outline"}
                  onClick={() => setBearing(p.bearing)}
                >
                  {t(`presets.${p.key}`)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={179}
                value={bearing}
                aria-label={t("angle")}
                onChange={(e) => setBearing(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-12 text-end tabular-nums">{bearing}°</span>
            </div>
            <DirectionPreview parcels={parcels} bearing={bearing} count={order.length} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">{t("order")}</legend>
            <p className="text-xs text-muted-foreground">{t("orderHint")}</p>
            <ol className="divide-y rounded-lg border">
              {order.map((id, i) => {
                const b = beneficiaries.find((x) => x.id === id)!;
                const part = resolution.shares.get(id)?.part ?? 0;
                return (
                  <li key={id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="size-3 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatPercent(part, locale)}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("moveUp", { name: b.name })}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("moveDown", { name: b.name })}
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </li>
                );
              })}
            </ol>
            {resolution.status === "under" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("sharesUnder")}</p>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-name`}>{t("name")}</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              placeholder={t(`defaultName.${mode}`)}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button disabled={!!blocked || running} onClick={() => void run()}>
          {running ? <Loader2 className="animate-spin" /> : <Wand2 />} {t("run")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Property outline with sample cut lines at the chosen bearing and the strip order. */
function DirectionPreview({
  parcels,
  bearing,
  count,
}: {
  parcels: GeoJSON.Geometry[];
  bearing: number;
  count: number;
}) {
  const SIZE = 180;
  const PAD = 10;
  const rings: Position[][] = parcels.flatMap((g) =>
    g.type === "Polygon"
      ? [g.coordinates[0]]
      : g.type === "MultiPolygon"
        ? g.coordinates.map((p) => p[0])
        : [],
  );
  const pts = rings.flat();
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos((lat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = (SIZE - 2 * PAD) / Math.max(maxX - minX, maxY - minY, 1e-12);
  const ox = (SIZE - (maxX - minX) * scale) / 2;
  const oy = (SIZE - (maxY - minY) * scale) / 2;
  const P = ([x, y]: Position) => [ox + (x * k - minX) * scale, oy + (maxY - y) * scale] as const;
  const rad = (bearing * Math.PI) / 180;
  const v = [Math.sin(rad), -Math.cos(rad)]; // screen: y grows downwards
  const u = [Math.sin(rad + Math.PI / 2), -Math.cos(rad + Math.PI / 2)];
  const c = SIZE / 2;
  const lines = Array.from(
    { length: Math.max(count - 1, 0) },
    (_, i) => ((i + 1) / count - 0.5) * SIZE * 0.8,
  );
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto h-40 w-40 rounded-lg border bg-muted/40"
      aria-hidden
    >
      <defs>
        <clipPath id="autosplit-clip">
          {rings.map((r, i) => (
            <path key={i} d={`M${r.map((p) => P(p).join(",")).join("L")}Z`} />
          ))}
        </clipPath>
      </defs>
      {rings.map((r, i) => (
        <path
          key={i}
          d={`M${r.map((p) => P(p).join(",")).join("L")}Z`}
          fill="rgb(22 163 74 / 0.15)"
          stroke="#15803d"
          strokeWidth={1.5}
        />
      ))}
      <g clipPath="url(#autosplit-clip)">
        {lines.map((s, i) => (
          <line
            key={i}
            x1={c + u[0] * s - v[0] * SIZE}
            y1={c + u[1] * s - v[1] * SIZE}
            x2={c + u[0] * s + v[0] * SIZE}
            y2={c + u[1] * s + v[1] * SIZE}
            stroke="#ca8a04"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ))}
      </g>
      <text
        x={c - u[0] * SIZE * 0.42}
        y={c - u[1] * SIZE * 0.42}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        1
      </text>
      <text
        x={c + u[0] * SIZE * 0.42}
        y={c + u[1] * SIZE * 0.42}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {count}
      </text>
    </svg>
  );
}
