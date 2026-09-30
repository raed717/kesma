"use client";

import {
  Copy,
  Layers,
  MoreVertical,
  Pencil,
  Plus,
  Shapes,
  SquareDashed,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { totalAreaM2 } from "@/domain/geometry/measure";
import type { Scenario } from "@/domain/model/project";
import { createScenario, duplicateScenario, lotsFromParcels } from "@/domain/scenarios";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { ProjectFormDialog } from "../projects/project-form-dialog";
import { AllocationView } from "./allocation-view";
import { LotsView } from "./lots-view";
import { useActiveScenario, useDisplayedLots } from "./scenario-state";
import { ScenarioStatusRow } from "./scenario-status";
import { useValidation } from "./validation-runner";
import { ValidationView } from "./validation-view";

type Dialog =
  | { kind: "none" }
  | { kind: "new"; fromProperty: boolean }
  | { kind: "rename" | "duplicate" | "delete"; scenario: Scenario };

export function ScenariosPanel() {
  const t = useTranslations("scenarios");
  const tc = useTranslations("common");
  const update = useWorkspaceStore((s) => s.update);
  const project = useWorkspaceStore((s) => s.project);
  const scenario = useActiveScenario();
  const lots = useDisplayedLots(scenario);
  const { setActiveScenario, scenarioView: view, setScenarioView } = useMapUiStore();
  const { result: validation } = useValidation(scenario?.id ?? null);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const close = () => setDialog({ kind: "none" });

  if (!project) return null;
  const parcels = project.property.parcels;
  const scenarios = project.scenarios;
  const areaUnit = project.settings.areaUnit;
  const propertyArea = totalAreaM2(parcels.map((p) => p.geometry));

  function addScenario(name: string, fromProperty: boolean) {
    const s = createScenario({
      name,
      lots: fromProperty ? lotsFromParcels(parcels, t("lotPrefix")) : [],
    });
    update((d) => void d.scenarios.push(s), { immediate: true });
    setActiveScenario(s.id);
  }

  if (parcels.length === 0) {
    return (
      <Empty
        icon={<Layers className="size-5" />}
        title={t("needPropertyTitle")}
        body={t("needPropertyBody")}
      />
    );
  }

  const defaultName = t("defaultName", { n: scenarios.length + 1 });

  const dialogs = (
    <>
      <ProjectFormDialog
        open={dialog.kind === "new"}
        onOpenChange={(o) => !o && close()}
        title={t("newTitle")}
        placeholder={t("namePlaceholder")}
        submitLabel={tc("create")}
        initialValues={{ name: defaultName }}
        onSubmit={({ name }) => {
          if (dialog.kind === "new") addScenario(name, dialog.fromProperty);
        }}
      />
      <ProjectFormDialog
        open={dialog.kind === "rename"}
        onOpenChange={(o) => !o && close()}
        title={t("renameTitle")}
        placeholder={t("namePlaceholder")}
        submitLabel={tc("save")}
        initialValues={dialog.kind === "rename" ? { name: dialog.scenario.name } : undefined}
        onSubmit={({ name }) => {
          if (dialog.kind !== "rename") return;
          const id = dialog.scenario.id;
          update((d) => {
            const s = d.scenarios.find((x) => x.id === id);
            if (s) s.name = name;
          });
        }}
      />
      <ProjectFormDialog
        open={dialog.kind === "duplicate"}
        onOpenChange={(o) => !o && close()}
        title={t("duplicateTitle")}
        placeholder={t("namePlaceholder")}
        submitLabel={tc("duplicate")}
        initialValues={
          dialog.kind === "duplicate"
            ? { name: t("copyOf", { name: dialog.scenario.name }) }
            : undefined
        }
        onSubmit={({ name }) => {
          if (dialog.kind !== "duplicate") return;
          const copy = duplicateScenario(dialog.scenario, name);
          update((d) => void d.scenarios.push(copy), { immediate: true });
          setActiveScenario(copy.id);
        }}
      />
      <AlertDialog open={dialog.kind === "delete"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.kind === "delete" && t("deleteBody", { name: dialog.scenario.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (dialog.kind !== "delete") return;
                const id = dialog.scenario.id;
                update((d) => void (d.scenarios = d.scenarios.filter((s) => s.id !== id)), {
                  immediate: true,
                });
                setActiveScenario(null);
                close();
              }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (!scenario) {
    return (
      <>
        <Empty icon={<Layers className="size-5" />} title={t("emptyTitle")} body={t("emptyBody")}>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => setDialog({ kind: "new", fromProperty: true })}>
              <Shapes /> {t("newFromProperty")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: "new", fromProperty: false })}
            >
              <SquareDashed /> {t("newEmpty")}
            </Button>
          </div>
        </Empty>
        {dialogs}
      </>
    );
  }

  const views = [
    { id: "lots", label: t("views.lots"), badge: lots.length },
    { id: "allocation", label: t("views.allocation"), badge: null },
    {
      id: "validation",
      label: t("views.validation"),
      badge: validation ? validation.counts.errors + validation.counts.warnings : null,
      tone: validation?.status,
    },
  ] as const;

  return (
    <div className="flex flex-col">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center gap-2">
          <select
            aria-label={t("scenario")}
            value={scenario.id}
            onChange={(e) => setActiveScenario(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm font-medium dark:bg-input/30"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon-sm" aria-label={t("actions")} />}
            >
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => setDialog({ kind: "new", fromProperty: true })}>
                <Shapes /> {t("newFromProperty")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "new", fromProperty: false })}>
                <Plus /> {t("newEmpty")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "duplicate", scenario })}>
                <Copy /> {tc("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog({ kind: "rename", scenario })}>
                <Pencil /> {tc("rename")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog({ kind: "delete", scenario })}
              >
                <Trash2 /> {tc("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScenarioStatusRow scenario={scenario} />

        <div
          role="tablist"
          aria-label={t("views.label")}
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setScenarioView(v.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
                view === v.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{v.label}</span>
              {v.badge !== null && v.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums",
                    "tone" in v && v.tone === "invalid"
                      ? "bg-red-500 text-white"
                      : "tone" in v && v.tone === "incomplete"
                        ? "bg-amber-500 text-white"
                        : "bg-foreground/10",
                  )}
                >
                  {v.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {view === "lots" && (
        <LotsView
          scenario={scenario}
          lots={lots}
          beneficiaries={project.beneficiaries}
          areaUnit={areaUnit}
          propertyArea={propertyArea}
        />
      )}
      {view === "allocation" && (
        <AllocationView
          lots={lots}
          beneficiaries={project.beneficiaries}
          areaUnit={areaUnit}
          tolerancePct={project.settings.areaTolerancePct}
        />
      )}
      {view === "validation" && (
        <ValidationView
          scenario={scenario}
          beneficiaries={project.beneficiaries}
          areaUnit={areaUnit}
        />
      )}
      {dialogs}
    </div>
  );
}

function Empty({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
