import type { Project } from "@/domain/model/project";
import { fileSlug } from "@/io/project-file";
import { toCsv } from "@/io/export/table";
import { downloadBlob, downloadText } from "@/lib/download";
import { allocationTable, comparisonTable, workbookTables, type ExportT } from "./tables";

/** The analysis needs JSTS (validation, value model): loaded on first export. */
const loadAnalysis = () => import("@/domain/compare");

function dateStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function exportGeoJson(project: Project, scenarioId: string | null) {
  const [{ analyzeProject }, { buildGeoJsonExport }] = await Promise.all([
    loadAnalysis(),
    import("@/io/export/geojson"),
  ]);
  const scenario = project.scenarios.find((s) => s.id === scenarioId);
  const analysis = scenario ? analyzeProject(project, [scenario]).scenarios[0] : null;
  const data = buildGeoJsonExport(project, analysis);
  const suffix = scenario ? `-${fileSlug(scenario.name, "scenario")}` : "";
  downloadText(
    JSON.stringify(data, null, 1),
    `${fileSlug(project.name)}${suffix}.geojson`,
    "application/geo+json",
  );
}

export async function exportWorkbook(project: Project, t: ExportT, rtl: boolean) {
  const [{ analyzeProject }, { toXlsx }] = await Promise.all([
    loadAnalysis(),
    import("@/io/export/xlsx"),
  ]);
  const tables = workbookTables(project, analyzeProject(project), t);
  const blob = await toXlsx(tables, { rtl });
  downloadBlob(blob, `${fileSlug(project.name)}-${dateStamp()}.xlsx`);
}

export async function exportAllocationCsv(project: Project, scenarioId: string, t: ExportT) {
  const { analyzeProject } = await loadAnalysis();
  const scenario = project.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  const analysis = analyzeProject(project, [scenario]);
  const table = allocationTable(project, analysis, analysis.scenarios[0], t);
  downloadText(
    toCsv(table),
    `${fileSlug(project.name)}-${fileSlug(scenario.name, "scenario")}-${fileSlug(table.name)}.csv`,
    "text/csv;charset=utf-8",
  );
}

export async function exportComparisonCsv(project: Project, t: ExportT) {
  const { analyzeProject } = await loadAnalysis();
  const table = comparisonTable(project, analyzeProject(project), t);
  downloadText(
    toCsv(table),
    `${fileSlug(project.name)}-${fileSlug(table.name)}.csv`,
    "text/csv;charset=utf-8",
  );
}
