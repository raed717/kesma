"use client";

import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AllocationStatus } from "@/domain/allocation";
import type { ProjectAnalysis, ScenarioAnalysis } from "@/domain/compare";
import { geometryAreaM2 } from "@/domain/geometry/measure";
import type { Project } from "@/domain/model/project";
import { formatPercent, shareInputSummary } from "@/domain/shares";
import { formatArea, formatLength } from "@/domain/units";
import { cn } from "@/lib/utils";
import { formatMoney } from "../value/use-value-data";
import { ComparisonTable } from "./comparison-table";
import { ProjectPageShell } from "./project-page-shell";
import { SvgPlan, type PlanShape } from "./svg-plan";
import { useProjectAnalysis } from "./use-stored-project";

const UNASSIGNED = "#22d3ee";
const STATUS_TEXT: Record<AllocationStatus, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  off: "text-red-700",
  noTarget: "text-slate-500",
};

export function ReportScreen({
  projectId,
  initialScenario,
}: {
  projectId: string;
  initialScenario?: string;
}) {
  const t = useTranslations("report");
  return (
    <ProjectPageShell
      projectId={projectId}
      title={t("title")}
      className="bg-muted/40 print:bg-white"
      actions={() => (
        <Button size="sm" onClick={() => window.print()} data-testid="print-report">
          <Printer /> <span className="hidden sm:inline">{t("print")}</span>
        </Button>
      )}
    >
      {(project) => <ReportBody project={project} initialScenario={initialScenario} />}
    </ProjectPageShell>
  );
}

function ReportBody({ project, initialScenario }: { project: Project; initialScenario?: string }) {
  const t = useTranslations("report");
  const analysis = useProjectAnalysis(project);
  const ids = project.scenarios.map((s) => s.id);
  const [scenarioId, setScenarioId] = useState<string>(
    initialScenario && ids.includes(initialScenario) ? initialScenario : (ids[0] ?? ""),
  );
  const scenario = project.scenarios.find((s) => s.id === scenarioId) ?? null;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteText = notes[scenarioId] ?? scenario?.notes ?? "";
  const [withComparison, setWithComparison] = useState(true);
  const [withCoordinates, setWithCoordinates] = useState(false);

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-3 sm:p-6 print:block print:p-0">
      <section
        className="w-full max-w-[210mm] space-y-3 rounded-lg border bg-background p-4 print:hidden"
        aria-label={t("options")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {project.scenarios.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="report-scenario">{t("scenario")}</Label>
              <select
                id="report-scenario"
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                {project.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5 text-sm">
            {project.scenarios.length > 1 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={withComparison}
                  onChange={(e) => setWithComparison(e.target.checked)}
                />
                {t("includeComparison")}
              </label>
            )}
            {scenario && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={withCoordinates}
                  onChange={(e) => setWithCoordinates(e.target.checked)}
                />
                {t("includeCoordinates")}
              </label>
            )}
          </div>
        </div>
        {scenario && (
          <div className="space-y-1.5">
            <Label htmlFor="report-notes">{t("notesLabel")}</Label>
            <Textarea
              id="report-notes"
              rows={3}
              value={noteText}
              placeholder={t("notesPlaceholder")}
              onChange={(e) => setNotes((n) => ({ ...n, [scenarioId]: e.target.value }))}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("printHint")}</p>
      </section>

      {analysis ? (
        <Paper project={project}>
          <Report
            project={project}
            analysis={analysis}
            sa={analysis.scenarios.find((s) => s.scenario.id === scenarioId) ?? null}
            notes={noteText}
            withComparison={withComparison && project.scenarios.length > 1}
            withCoordinates={withCoordinates}
          />
        </Paper>
      ) : (
        <div className="h-[297mm] w-full max-w-[210mm] animate-pulse rounded bg-background" />
      )}
    </main>
  );
}

/**
 * A4 sheet. The table's <tfoot> reserves room at the bottom of every printed page, where
 * the fixed footer (disclaimer) is repeated by the browser.
 */
function Paper({ project, children }: { project: Project; children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const footer = (
    <div className="flex items-end justify-between gap-4 border-t border-slate-300 pt-1.5 text-[9px] leading-snug text-slate-600">
      <span>{t("app.disclaimerShort")}</span>
      <span className="shrink-0">
        KESMA · {project.name} · {new Date().toLocaleDateString(locale)}
      </span>
    </div>
  );
  return (
    <div
      className="paper w-full max-w-[210mm] bg-white text-[11px] leading-relaxed text-slate-900 shadow-lg print:max-w-none print:shadow-none"
      data-testid="report-paper"
    >
      <table className="w-full">
        <tbody>
          <tr>
            <td className="px-[12mm] py-[12mm] align-top print:p-0">{children}</td>
          </tr>
        </tbody>
        <tfoot className="hidden print:table-footer-group">
          <tr>
            <td className="h-[12mm]" />
          </tr>
        </tfoot>
      </table>
      <div className="px-[12mm] pb-[8mm] print:hidden">{footer}</div>
      <div className="fixed inset-x-0 bottom-0 hidden bg-white print:block">{footer}</div>
    </div>
  );
}

type ReportProps = {
  project: Project;
  analysis: ProjectAnalysis;
  sa: ScenarioAnalysis | null;
  notes: string;
  withComparison: boolean;
  withCoordinates: boolean;
};

function Report({ project, analysis, sa, notes, withComparison, withCoordinates }: ReportProps) {
  const t = useTranslations("report");
  const tStatus = useTranslations("scenarios.status");
  const tDisclaimer = useTranslations("disclaimer");
  const tProp = useTranslations("property.details");
  const tKinds = useTranslations("scenarios.validation.kinds");
  const tAlloc = useTranslations("scenarios.allocation");
  const tValue = useTranslations("value");
  const tShares = useTranslations("beneficiaries");
  const locale = useLocale();
  const unit = project.settings.areaUnit;
  const currency = project.settings.currency;
  const area = (m2: number) => formatArea(m2, unit, locale);
  const money = (v: number) => formatMoney(v, currency, locale);
  const pct = (r: number) => formatPercent(r, locale, 2);
  const len = (m: number) => formatLength(m, locale);
  const names = new Map(project.beneficiaries.map((b) => [b.id, b]));
  const valued = analysis.valued && !!sa?.valueAllocation;
  const frontage = !!analysis.model?.hasFrontage;
  let section = 0;
  const heading = (text: string) => `${++section}. ${text}`;

  const parcelShapes = useMemo<PlanShape[]>(
    () =>
      project.property.parcels.map((p) => ({
        id: p.id,
        geometry: p.geometry,
        fill: "#16a34a",
        fillOpacity: 0.12,
        stroke: "#14532d",
        strokeWidth: 1.6,
        label: [p.label, formatArea(geometryAreaM2(p.geometry), unit, locale)],
      })),
    [project.property.parcels, unit, locale],
  );
  const outline = useMemo<PlanShape[]>(
    () =>
      project.property.parcels.map((p) => ({
        id: `o-${p.id}`,
        geometry: p.geometry,
        fill: "#ffffff",
        fillOpacity: 0,
        stroke: "#14532d",
        strokeWidth: 2.4,
      })),
    [project.property.parcels],
  );
  const zoneShapes = useMemo<PlanShape[]>(
    () =>
      project.valueZones.map((z) => ({
        id: z.id,
        geometry: z.geometry,
        fill: z.color,
        fillOpacity: 0.25,
        stroke: z.color,
        dashed: true,
        label: [z.name],
      })),
    [project.valueZones],
  );
  const lotShapes = useMemo<PlanShape[]>(
    () =>
      (sa?.scenario.lots ?? []).map((l) => ({
        id: l.id,
        geometry: l.geometry,
        fill: (l.beneficiaryId && names.get(l.beneficiaryId)?.color) || UNASSIGNED,
        fillOpacity: 0.4,
        stroke: "#0f172a",
        strokeWidth: 1.1,
        label: [l.label, formatArea(geometryAreaM2(l.geometry), unit, locale)],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sa, project.beneficiaries, unit, locale],
  );
  const roads = project.frontageLines.map((f) => ({
    id: f.id,
    geometry: f.geometry,
    color: "#7c3aed",
  }));
  const plan = (layers: PlanShape[][], title: string) => (
    <SvgPlan
      layers={layers}
      lines={roads}
      northLabel={t("north")}
      formatLength={len}
      title={title}
    />
  );

  return (
    <article className="space-y-6">
      {/* ---------- cover ---------- */}
      <header className="space-y-4 border-b-2 border-emerald-800 pb-5">
        <p className="text-xs font-semibold tracking-widest text-emerald-800 uppercase">
          KESMA · {t("kicker")}
        </p>
        <h1 className="text-2xl leading-tight font-bold" data-testid="report-title">
          {project.name}
        </h1>
        {project.description && <p className="text-sm text-slate-700">{project.description}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          <Fact
            label={t("facts.date")}
            value={new Date().toLocaleDateString(locale, { dateStyle: "long" })}
          />
          <Fact label={t("facts.propertyArea")} value={area(analysis.propertyAreaM2)} />
          <Fact label={t("facts.parcels")} value={project.property.parcels.length} />
          <Fact label={t("facts.beneficiaries")} value={project.beneficiaries.length} />
          {sa && <Fact label={t("facts.scenario")} value={sa.scenario.name} />}
          {sa && (
            <Fact
              label={t("facts.status")}
              value={`${tStatus(`workflow.${sa.scenario.status}`)} · ${tStatus(`validity.${sa.validation.status}`)}`}
            />
          )}
          {valued && <Fact label={tValue("propertyValue")} value={money(analysis.propertyValue)} />}
        </dl>
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-[10.5px] text-amber-950">
          <p className="font-semibold">{t("disclaimerTitle")}</p>
          <p className="mt-1">{tDisclaimer("body2")}</p>
        </div>
      </header>

      {/* ---------- property ---------- */}
      <Section title={heading(t("sections.property"))}>
        {parcelShapes.length > 0 ? (
          plan([parcelShapes, zoneShapes], t("sections.property"))
        ) : (
          <p className="text-slate-500">{t("noProperty")}</p>
        )}
        {parcelShapes.length > 0 && (
          <DataTable
            head={[tProp("label"), tProp("area"), tProp("landUse"), tProp("source")]}
            numeric={[1]}
            rows={project.property.parcels.map((p) => [
              p.label,
              area(geometryAreaM2(p.geometry)),
              p.attributes.landUse ? tProp(`landUses.${p.attributes.landUse}`) : "—",
              p.source ? tProp(`formats.${p.source.format}`) : "—",
            ])}
            foot={[t("total"), area(analysis.propertyAreaM2), "", ""]}
          />
        )}
      </Section>

      {/* ---------- beneficiaries ---------- */}
      {project.beneficiaries.length > 0 && (
        <Section title={heading(t("sections.beneficiaries"))}>
          <DataTable
            head={[t("cols.beneficiary"), t("cols.shareInput"), t("cols.share"), t("cols.target")]}
            numeric={[2, 3]}
            rows={project.beneficiaries.map((b) => {
              const s = analysis.shares.shares.get(b.id);
              return [
                <Swatch key="n" color={b.color} label={b.name} />,
                b.share.mode === "remainder"
                  ? tShares("modeBadge.remainder", { weight: b.share.weight })
                  : shareInputSummary(b.share),
                s ? pct(s.part) : "—",
                s?.targetAreaM2 != null ? area(s.targetAreaM2) : "—",
              ];
            })}
          />
          {analysis.shares.status !== "complete" && (
            <p className="text-amber-800">{tAlloc("sharesIncomplete")}</p>
          )}
          <p className="text-[10px] text-slate-500">{t("sharesNote")}</p>
        </Section>
      )}

      {sa && (
        <>
          {/* ---------- scenario plan ---------- */}
          <Section title={heading(t("sections.scenario", { name: sa.scenario.name }))} pageBreak>
            {plan([outline, lotShapes], sa.scenario.name)}
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {project.beneficiaries.map((b) => (
                <li key={b.id}>
                  <Swatch color={b.color} label={b.name} />
                </li>
              ))}
              {sa.allocation.unassigned.lotIds.length > 0 && (
                <li>
                  <Swatch color={UNASSIGNED} label={t("unassigned")} />
                </li>
              )}
              {roads.length > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-violet-600" /> {tValue("frontage.title")}
                </li>
              )}
            </ul>
            <DataTable
              head={[
                t("cols.lot"),
                t("cols.beneficiary"),
                t("cols.area"),
                ...(valued ? [t("cols.value")] : []),
                ...(frontage ? [t("cols.frontage")] : []),
              ]}
              numeric={[2, 3, 4]}
              rows={sa.scenario.lots.map((l) => {
                const v = sa.lotValues.get(l.id);
                const b = l.beneficiaryId ? names.get(l.beneficiaryId) : undefined;
                return [
                  l.label,
                  b ? <Swatch key="b" color={b.color} label={b.name} /> : t("unassigned"),
                  area(geometryAreaM2(l.geometry)),
                  ...(valued ? [v ? money(v.total) : "—"] : []),
                  ...(frontage ? [v && v.frontageM > 0 ? len(v.frontageM) : "—"] : []),
                ];
              })}
            />
            {sa.scenario.lots.length === 0 && <p className="text-slate-500">{t("noLots")}</p>}
          </Section>

          {/* ---------- allocation ---------- */}
          {project.beneficiaries.length > 0 && (
            <Section title={heading(t("sections.allocation"))}>
              <p>
                {tAlloc("summary", {
                  ok: sa.indicators.withinTolerance,
                  total: sa.indicators.withTarget,
                  tolerance: project.settings.areaTolerancePct,
                })}
                {sa.indicators.withTarget > 0 &&
                  ` · ${tAlloc("maxDeviation", { value: pct(sa.indicators.maxAreaDeviation) })}`}
              </p>
              <DataTable
                head={[
                  t("cols.beneficiary"),
                  t("cols.lots"),
                  t("cols.target"),
                  t("cols.received"),
                  t("cols.diff"),
                  ...(valued ? [t("cols.targetValue"), t("cols.value"), t("cols.valueDiff")] : []),
                  ...(frontage ? [t("cols.roadAccess")] : []),
                ]}
                numeric={[2, 3, 4, 5, 6, 7]}
                rows={sa.allocation.rows.map((r) => {
                  const b = names.get(r.beneficiaryId)!;
                  const v = sa.valueAllocation?.rows.find(
                    (x) => x.beneficiaryId === r.beneficiaryId,
                  );
                  const labels = r.lotIds
                    .map((id) => sa.scenario.lots.find((l) => l.id === id)?.label)
                    .join(", ");
                  return [
                    <Swatch key="b" color={b.color} label={b.name} />,
                    labels || "—",
                    r.targetM2 !== null ? area(r.targetM2) : "—",
                    area(r.allocatedM2),
                    <Deviation key="d" ratio={r.diffRatio} status={r.status} pct={pct} />,
                    ...(valued && v
                      ? [
                          v.targetValue !== null ? money(v.targetValue) : "—",
                          money(v.value),
                          <Deviation key="v" ratio={v.diffRatio} status={v.status} pct={pct} />,
                        ]
                      : []),
                    ...(frontage && v
                      ? [v.roadAccess ? `✓ ${len(v.frontageM)}` : tAlloc("noRoadAccess")]
                      : []),
                  ];
                })}
              />
              {sa.allocation.unassigned.lotIds.length > 0 && (
                <p className="text-amber-800">
                  {t("unassignedLots", {
                    count: sa.allocation.unassigned.lotIds.length,
                    area: area(sa.allocation.unassigned.areaM2),
                  })}
                </p>
              )}
            </Section>
          )}

          {/* ---------- value parameters ---------- */}
          {(analysis.valued || frontage) && (
            <Section title={heading(t("sections.value"))}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Fact
                  label={tValue("baseValue", { currency })}
                  value={
                    project.settings.baseValuePerM2 ? money(project.settings.baseValuePerM2) : "—"
                  }
                />
                {analysis.valued && (
                  <Fact label={tValue("propertyValue")} value={money(analysis.propertyValue)} />
                )}
              </dl>
              {project.valueZones.length > 0 && (
                <DataTable
                  caption={tValue("zones.title")}
                  head={[t("cols.name"), t("cols.valuation")]}
                  rows={project.valueZones.map((z) => [
                    <Swatch key="z" color={z.color} label={z.name} />,
                    z.mode === "perM2"
                      ? tValue("zones.perM2Label", { value: z.value, currency })
                      : `× ${z.value}`,
                  ])}
                />
              )}
              {project.assets.length > 0 && (
                <DataTable
                  caption={tValue("assets.title")}
                  head={[t("cols.name"), t("cols.kind"), t("cols.value")]}
                  numeric={[2]}
                  rows={project.assets.map((a) => [
                    a.name,
                    tValue(`assets.kinds.${a.kind}`),
                    money(a.value),
                  ])}
                />
              )}
              {frontage && (
                <p>
                  {tValue("frontage.title")}: {project.frontageLines.map((f) => f.name).join(", ")}{" "}
                  · {t("roadRule")}
                </p>
              )}
              <p className="text-[10px] text-slate-500">{tValue("disclaimer")}</p>
            </Section>
          )}

          {/* ---------- validation ---------- */}
          <Section title={heading(t("sections.validation"))}>
            <p className="font-medium">
              {tStatus(`validity.${sa.validation.status}`)} ·{" "}
              {t("issueCounts", {
                errors: sa.validation.counts.errors,
                warnings: sa.validation.counts.warnings,
              })}
            </p>
            {sa.validation.issues.length > 0 ? (
              <DataTable
                head={[t("cols.issue"), t("cols.lots"), t("cols.area")]}
                numeric={[2]}
                rows={sa.validation.issues.map((i) => [
                  <span
                    key="k"
                    className={i.severity === "error" ? "text-red-700" : "text-amber-700"}
                  >
                    {tKinds(i.kind)}
                  </span>,
                  i.lotIds
                    .map((id) => sa.scenario.lots.find((l) => l.id === id)?.label)
                    .filter(Boolean)
                    .join(", ") || "—",
                  i.areaM2 !== undefined ? area(i.areaM2) : "—",
                ])}
              />
            ) : (
              <p>{t("noIssues")}</p>
            )}
          </Section>
        </>
      )}

      {/* ---------- comparison ---------- */}
      {withComparison && (
        <Section title={heading(t("sections.comparison"))}>
          <ComparisonTable
            project={project}
            analysis={analysis}
            className="rounded-none border-slate-300 text-[10.5px]"
          />
        </Section>
      )}

      {/* ---------- notes ---------- */}
      {notes.trim() && (
        <Section title={heading(t("sections.notes"))}>
          <p className="whitespace-pre-wrap">{notes}</p>
        </Section>
      )}

      {/* ---------- appendix ---------- */}
      {sa && withCoordinates && (
        <Section title={t("sections.coordinates")} pageBreak>
          <p className="text-[10px] text-slate-500">{t("coordinatesNote")}</p>
          {sa.scenario.lots.map((l) => (
            <DataTable
              key={l.id}
              caption={l.label}
              head={["#", t("cols.lat"), t("cols.lon")]}
              numeric={[1, 2]}
              compact
              rows={l.geometry.coordinates[0]
                .slice(0, -1)
                .map(([lon, lat], i) => [i + 1, lat.toFixed(7), lon.toFixed(7)])}
            />
          ))}
        </Section>
      )}
    </article>
  );
}

function Section({
  title,
  children,
  pageBreak,
}: {
  title: string;
  children: ReactNode;
  pageBreak?: boolean;
}) {
  return (
    <section className={cn("space-y-3", pageBreak && "print:break-before-page")}>
      <h2 className="break-after-avoid border-b border-slate-300 pb-1 text-sm font-bold text-emerald-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-slate-500">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Deviation({
  ratio,
  status,
  pct,
}: {
  ratio: number | null;
  status: AllocationStatus;
  pct: (r: number) => string;
}) {
  if (ratio === null) return <span className="text-slate-500">—</span>;
  // Below the displayed precision (0.01 %), a sign would only be noise.
  const tiny = Math.abs(ratio) < 0.00005;
  const sign = tiny ? "±" : ratio > 0 ? "+" : "−";
  return (
    <span className={cn("font-medium", STATUS_TEXT[status])}>
      {sign}
      {!Number.isFinite(ratio) ? "∞" : pct(tiny ? 0 : Math.abs(ratio))}
    </span>
  );
}

function DataTable({
  head,
  rows,
  foot,
  numeric = [],
  caption,
  compact,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  foot?: ReactNode[];
  numeric?: number[];
  caption?: string;
  compact?: boolean;
}) {
  const cell = (i: number) =>
    cn(
      "border-b border-slate-200 px-2 text-start",
      compact ? "py-0.5" : "py-1",
      numeric.includes(i) && "tabular-nums",
    );
  return (
    <table className="w-full border-collapse">
      {caption && <caption className="pb-1 text-start font-semibold">{caption}</caption>}
      <thead className="bg-slate-100">
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col" className={cn(cell(i), "font-semibold text-slate-700")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="break-inside-avoid">
            {r.map((c, i) => (
              <td key={i} className={cell(i)}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="font-semibold">
            {foot.map((c, i) => (
              <td key={i} className={cell(i)}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
