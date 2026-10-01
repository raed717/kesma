"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { IconButton } from "@/components/icon-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { Project } from "@/domain/model/project";
import { cn } from "@/lib/utils";
import { useStoredProject } from "./use-stored-project";

type Props = {
  projectId: string;
  title: string;
  /** Extra header buttons. */
  actions?: (project: Project) => ReactNode;
  children: (project: Project) => ReactNode;
  className?: string;
};

/** Header + loading/not-found handling for read-only project pages (compare, report). */
export function ProjectPageShell({ projectId, title, actions, children, className }: Props) {
  const t = useTranslations();
  const stored = useStoredProject(projectId);

  if (stored.state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (stored.state !== "ready") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">
          {stored.state === "not-found" ? t("workspace.notFound") : t("workspace.loadError")}
        </h1>
        <Button render={<Link href="/" />} nativeButton={false}>
          <ArrowLeft className="rtl:rotate-180" /> {t("workspace.backToProjects")}
        </Button>
      </div>
    );
  }

  const { project } = stored;
  return (
    <div className={cn("flex min-h-dvh flex-col", className)}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 print:hidden">
        <IconButton
          label={t("pages.backToProject")}
          icon={<ArrowLeft className="rtl:rotate-180" />}
          variant="ghost"
          render={<Link href={`/projects/${project.id}`} />}
          nativeButton={false}
        />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{project.name}</p>
        </div>
        <div className="ms-auto flex items-center gap-1">
          {actions?.(project)}
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      {children(project)}
    </div>
  );
}
