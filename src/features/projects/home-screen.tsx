"use client";

import { FileUp, FolderOpen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { DisclaimerDialog } from "@/components/disclaimer-dialog";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
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
import type { ProjectSummary } from "@/domain/model/project";
import { PROJECT_FILE_EXTENSION } from "@/io/project-file";
import {
  createAndSaveProject,
  duplicateAndSaveProject,
  importProjectFile,
  renameProject,
} from "@/services/projects";
import { getProjectRepository, ProjectFormatError, requestPersistentStorage } from "@/storage";
import { exportProjectFile } from "./export-project";
import { ProjectCard, type ProjectAction } from "./project-card";
import { ProjectFormDialog } from "./project-form-dialog";
import { useProjectList } from "./use-project-list";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename" | "duplicate" | "delete"; project: ProjectSummary };

export function HomeScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { projects, reload } = useProjectList();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const fileInput = useRef<HTMLInputElement>(null);
  const repo = () => getProjectRepository();
  const close = () => setDialog({ kind: "none" });

  async function handleAction(project: ProjectSummary, action: ProjectAction) {
    if (action === "export") {
      const full = await repo().get(project.id);
      if (full) {
        exportProjectFile(full);
        toast.success(t("toast.exported"));
      }
      return;
    }
    setDialog({ kind: action, project });
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { project, renamed } = await importProjectFile(repo(), await file.text());
      toast.success(t("toast.imported", { name: project.name }), {
        description: renamed ? t("toast.importedAsCopy") : undefined,
      });
      void requestPersistentStorage();
      await reload();
    } catch (error) {
      console.error("[kesma] Import failed", error);
      toast.error(t("toast.importFailed"), {
        description:
          error instanceof ProjectFormatError
            ? [error.message, ...error.issues.slice(0, 2)].join(" — ")
            : String(error),
      });
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("home.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <FileUp /> {t("home.importProject")}
            </Button>
            <Button onClick={() => setDialog({ kind: "create" })}>
              <Plus /> {t("home.newProject")}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={`${PROJECT_FILE_EXTENSION},.json,application/json`}
            className="hidden"
            onChange={handleImport}
            data-testid="import-input"
          />
        </div>

        {projects === null ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : projects.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FolderOpen className="size-6" />
            </div>
            <h2 className="mt-4 font-medium">{t("home.emptyTitle")}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("home.emptyBody")}</p>
            <Button className="mt-6" onClick={() => setDialog({ kind: "create" })}>
              <Plus /> {t("home.newProject")}
            </Button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id} className="flex">
                <ProjectCard project={p} onAction={(a) => handleAction(p, a)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 text-xs text-muted-foreground">
          <p>{t("app.disclaimerShort")}</p>
          <p>{t("home.backupHint")}</p>
        </div>
      </footer>

      <ProjectFormDialog
        open={dialog.kind === "create"}
        onOpenChange={(o) => !o && close()}
        title={t("projectForm.createTitle")}
        description={t("projectForm.createDescription")}
        submitLabel={t("common.create")}
        withDescription
        onSubmit={async (values) => {
          const project = await createAndSaveProject(repo(), values);
          void requestPersistentStorage();
          toast.success(t("toast.created"));
          router.push(`/projects/${project.id}`);
        }}
      />

      <ProjectFormDialog
        open={dialog.kind === "rename"}
        onOpenChange={(o) => !o && close()}
        title={t("projectForm.renameTitle")}
        submitLabel={t("common.save")}
        initialValues={dialog.kind === "rename" ? { name: dialog.project.name } : undefined}
        onSubmit={async ({ name }) => {
          if (dialog.kind !== "rename") return;
          await renameProject(repo(), dialog.project.id, name);
          toast.success(t("toast.renamed"));
          await reload();
        }}
      />

      <ProjectFormDialog
        open={dialog.kind === "duplicate"}
        onOpenChange={(o) => !o && close()}
        title={t("projectForm.duplicateTitle")}
        submitLabel={t("common.duplicate")}
        initialValues={
          dialog.kind === "duplicate"
            ? { name: t("projectForm.copyOf", { name: dialog.project.name }) }
            : undefined
        }
        onSubmit={async ({ name }) => {
          if (dialog.kind !== "duplicate") return;
          await duplicateAndSaveProject(repo(), dialog.project.id, name);
          toast.success(t("toast.duplicated"));
          await reload();
        }}
      />

      <AlertDialog open={dialog.kind === "delete"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProject.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.kind === "delete" && t("deleteProject.body", { name: dialog.project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (dialog.kind !== "delete") return;
                await repo().delete(dialog.project.id);
                close();
                toast.success(t("toast.deleted"));
                await reload();
              }}
            >
              {t("deleteProject.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DisclaimerDialog />
    </div>
  );
}
