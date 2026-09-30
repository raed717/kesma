"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Scenario, ScenarioStatus as WorkflowStatus } from "@/domain/model/project";
import { ScenarioStatusSchema } from "@/domain/model/project";
import type { ScenarioStatus } from "@/domain/validation";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useValidation } from "./validation-runner";

const BADGE: Record<ScenarioStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  valid: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
  incomplete: { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
  invalid: { cls: "bg-red-500/15 text-red-700 dark:text-red-400", Icon: AlertOctagon },
};

/** Geometry validation badge (Valid / Incomplete / Invalid) + workflow status (Draft / Proposed / Agreed). */
export function ScenarioStatusRow({ scenario }: { scenario: Scenario }) {
  const t = useTranslations("scenarios.status");
  const update = useWorkspaceStore((s) => s.update);
  const { result } = useValidation(scenario.id);

  return (
    <div className="flex items-center gap-2">
      {result ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            BADGE[result.status].cls,
          )}
          data-testid="scenario-validity"
        >
          {(() => {
            const { Icon } = BADGE[result.status];
            return <Icon className="size-3.5" />;
          })()}
          {t(`validity.${result.status}`)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      )}
      <select
        aria-label={t("workflowLabel")}
        value={scenario.status}
        onChange={(e) =>
          update((d) => {
            const s = d.scenarios.find((x) => x.id === scenario.id);
            if (s) s.status = e.target.value as WorkflowStatus;
          })
        }
        className="ms-auto h-7 rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30"
      >
        {ScenarioStatusSchema.options.map((s) => (
          <option key={s} value={s}>
            {t(`workflow.${s}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
