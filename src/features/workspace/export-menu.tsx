"use client";

import {
  ChevronDown,
  Columns2,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Map as MapIcon,
  Table2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "@/domain/model/project";
import { localeDirection } from "@/i18n/config";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useActiveScenario } from "../scenarios/scenario-state";
import { exportProjectFile } from "../projects/export-project";
import {
  exportAllocationCsv,
  exportComparisonCsv,
  exportGeoJson,
  exportWorkbook,
} from "../exports/run-export";

/** Saves pending edits, then opens another page of the project (compare, report). */
export function useOpenProjectPage() {
  const router = useRouter();
  return async (page: "compare" | "report", scenarioId?: string | null) => {
    await useWorkspaceStore.getState().flush();
    const id = useWorkspaceStore.getState().project?.id;
    if (!id) return;
    router.push(`/projects/${id}/${page}${scenarioId ? `?scenario=${scenarioId}` : ""}`);
  };
}

export function ExportMenu() {
  const t = useTranslations("exports");
  const tToast = useTranslations("toast");
  const rtl = localeDirection(useLocale()) === "rtl";
  const scenario = useActiveScenario();
  const scenarioCount = useWorkspaceStore((s) => s.project?.scenarios.length ?? 0);
  const hasBeneficiaries = useWorkspaceStore((s) => (s.project?.beneficiaries.length ?? 0) > 0);
  const hasParcels = useWorkspaceStore((s) => (s.project?.property.parcels.length ?? 0) > 0);
  const openPage = useOpenProjectPage();
  const [busy, setBusy] = useState(false);

  async function run(task: (project: Project) => Promise<void> | void) {
    await useWorkspaceStore.getState().flush();
    const project = useWorkspaceStore.getState().project;
    if (!project) return;
    setBusy(true);
    try {
      await task(project);
      toast.success(tToast("exported"));
    } catch (error) {
      console.error("[kesma] Export failed", error);
      toast.error(t("failed"), { description: String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" disabled={busy} data-testid="export-menu" />}
      >
        <Download /> <span className="hidden sm:inline">{t("menu")}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem
          onClick={() => void openPage("report", scenario?.id)}
          disabled={!hasParcels}
        >
          <FileText /> {t("report")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void openPage("compare")} disabled={scenarioCount === 0}>
          <Columns2 /> {t("compare")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("filesLabel")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void run((p) => exportProjectFile(p))}>
            <FileJson /> {t("projectFile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasParcels}
            onClick={() => void run((p) => exportGeoJson(p, scenario?.id ?? null))}
          >
            <MapIcon />
            <span className="min-w-0 flex-1 truncate">
              {scenario ? t("geojsonScenario", { name: scenario.name }) : t("geojsonProperty")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasParcels}
            onClick={() => void run((p) => exportWorkbook(p, t, rtl))}
          >
            <FileSpreadsheet /> {t("xlsx")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!scenario || !hasBeneficiaries}
            onClick={() => scenario && void run((p) => exportAllocationCsv(p, scenario.id, t))}
          >
            <Table2 /> {t("allocationCsv")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={scenarioCount === 0}
            onClick={() => void run((p) => exportComparisonCsv(p, t))}
          >
            <Table2 /> {t("comparisonCsv")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
