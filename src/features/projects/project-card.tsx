"use client";

import { Copy, Download, MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectSummary } from "@/domain/model/project";
import { formatArea } from "@/domain/units";

export type ProjectAction = "rename" | "duplicate" | "export" | "delete";

type Props = { project: ProjectSummary; onAction: (action: ProjectAction) => void };

export function ProjectCard({ project, onAction }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale();

  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 leading-snug font-medium">
          <Link
            href={`/projects/${project.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {project.name}
          </Link>
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative z-10 -me-1 -mt-1 shrink-0"
                aria-label={t("home.actions")}
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onAction("rename")}>
              <Pencil /> {t("common.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("duplicate")}>
              <Copy /> {t("common.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("export")}>
              <Download /> {t("home.exportFile")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onAction("delete")}>
              <Trash2 /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <li>
          {t("home.parcels", { count: project.parcelCount })}
          {project.parcelCount > 0 && ` · ${formatArea(project.propertyAreaM2, "ha", locale)}`}
        </li>
        <li>{t("home.beneficiaries", { count: project.beneficiaryCount })}</li>
        <li>{t("home.scenarios", { count: project.scenarioCount })}</li>
      </ul>

      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        {t("home.updated", {
          date: format.dateTime(new Date(project.updatedAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })}
      </p>
    </article>
  );
}
