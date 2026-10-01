"use client";

import { Columns2, FileText } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectAnalysis } from "@/domain/compare";
import type { Project } from "@/domain/model/project";
import { formatPercent } from "@/domain/shares";
import { cn } from "@/lib/utils";
import { ComparisonTable } from "./comparison-table";
import { ProjectPageShell } from "./project-page-shell";
import { useProjectAnalysis } from "./use-stored-project";

const CompareMaps = dynamic(() => import("./compare-maps"), {
  ssr: false,
  loading: () => <div className="min-h-[18rem] flex-1 animate-pulse rounded-lg bg-muted" />,
});

export function CompareScreen({
  projectId,
  initialScenario,
}: {
  projectId: string;
  initialScenario?: string;
}) {
  const t = useTranslations("compare");
  return (
    <ProjectPageShell
      projectId={projectId}
      title={t("title")}
      actions={(project) =>
        project.scenarios.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/projects/${project.id}/report`} />}
            nativeButton={false}
          >
            <FileText /> <span className="hidden sm:inline">{t("openReport")}</span>
          </Button>
        )
      }
    >
      {(project) => <CompareBody project={project} initialScenario={initialScenario} />}
    </ProjectPageShell>
  );
}

function CompareBody({ project, initialScenario }: { project: Project; initialScenario?: string }) {
  const t = useTranslations("compare");
  const analysis = useProjectAnalysis(project);
  const ids = project.scenarios.map((s) => s.id);
  const first = initialScenario && ids.includes(initialScenario) ? initialScenario : ids[0];
  const [picked, setPicked] = useState<[string | null, string | null]>([
    first ?? null,
    ids.find((id) => id !== first) ?? null,
  ]);
  const scenarios = picked.map((id) => project.scenarios.find((s) => s.id === id) ?? null) as [
    Project["scenarios"][number] | null,
    Project["scenarios"][number] | null,
  ];

  if (project.scenarios.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Columns2 className="size-8 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t("noScenarios")}</p>
      </div>
    );
  }

  const header = (side: 0 | 1) => (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {side === 0 ? "A" : "B"}
      </span>
      <select
        aria-label={t("pick", { side: side === 0 ? "A" : "B" })}
        value={picked[side] ?? ""}
        onChange={(e) =>
          setPicked((p) => (side === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))
        }
        className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm font-medium dark:bg-input/30"
      >
        {project.scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {analysis && picked[side] && <PaneSummary analysis={analysis} scenarioId={picked[side]} />}
    </div>
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
      <div className="flex h-[min(62vh,40rem)] min-h-[24rem] flex-col">
        <CompareMaps project={project} scenarios={scenarios} headers={[header(0), header(1)]} />
      </div>
      <Legend project={project} />
      <section aria-labelledby="comparison-heading" className="space-y-2">
        <h2 id="comparison-heading" className="font-semibold">
          {t("tableTitle", { count: project.scenarios.length })}
        </h2>
        {analysis ? (
          <ComparisonTable project={project} analysis={analysis} marked={picked} />
        ) : (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        )}
        <p className="text-xs text-muted-foreground">{t("bestHint")}</p>
      </section>
    </main>
  );
}

function PaneSummary({ analysis, scenarioId }: { analysis: ProjectAnalysis; scenarioId: string }) {
  const t = useTranslations("compare");
  const tStatus = useTranslations("scenarios.status");
  const locale = useLocale();
  const s = analysis.scenarios.find((x) => x.scenario.id === scenarioId);
  if (!s) return null;
  return (
    <span className="hidden shrink-0 items-center gap-2 text-xs lg:inline-flex">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-medium",
          s.validation.status === "valid"
            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            : s.validation.status === "incomplete"
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "bg-red-500/15 text-red-800 dark:text-red-300",
        )}
      >
        {tStatus(`validity.${s.validation.status}`)}
      </span>
      {s.indicators.withTarget > 0 && (
        <span className="text-muted-foreground">
          {t("maxDeviationShort", {
            value: formatPercent(s.indicators.maxAreaDeviation, locale, 1),
          })}
        </span>
      )}
    </span>
  );
}

function Legend({ project }: { project: Project }) {
  const t = useTranslations("compare");
  if (project.beneficiaries.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("legend")}>
      {project.beneficiaries.map((b) => (
        <li key={b.id} className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ backgroundColor: b.color }} />
          {b.name}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="size-3 rounded-sm bg-[#22d3ee]" />
        {t("unassigned")}
      </li>
    </ul>
  );
}
