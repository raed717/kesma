"use client";

import { ArrowLeft, Download, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { MapProvider } from "react-map-gl/maplibre";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { DisclaimerDialog } from "@/components/disclaimer-dialog";
import { IconButton } from "@/components/icon-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { exportProjectFile } from "../projects/export-project";
import { ProjectNameEditor } from "./project-name-editor";
import { SaveIndicator } from "./save-indicator";
import { SidePanel } from "./side-panel";

// MapLibre needs `window`/WebGL: never render it on the server.
const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" />,
});

export function Workspace({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const loadState = useWorkspaceStore((s) => s.loadState);
  const projectLoaded = useWorkspaceStore((s) => s.project?.id === projectId);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    const store = useWorkspaceStore.getState();
    void store.load(projectId);
    useMapUiStore.getState().setTool("pan");
    useMapUiStore.getState().selectParcel(null);
    const flush = () => void useWorkspaceStore.getState().flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      void useWorkspaceStore.getState().close();
    };
  }, [projectId]);

  useSaveErrorToast();

  if (loadState === "not-found" || loadState === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">
          {loadState === "not-found" ? t("workspace.notFound") : t("workspace.loadError")}
        </h1>
        {loadState === "not-found" && (
          <p className="max-w-sm text-sm text-muted-foreground">{t("workspace.notFoundBody")}</p>
        )}
        <Button render={<Link href="/" />} nativeButton={false}>
          <ArrowLeft className="rtl:rotate-180" /> {t("workspace.backToProjects")}
        </Button>
      </div>
    );
  }

  if (!projectLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <MapProvider>
      <div className="flex h-dvh flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <IconButton
            label={t("workspace.backToProjects")}
            icon={<ArrowLeft className="rtl:rotate-180" />}
            variant="ghost"
            render={<Link href="/" />}
            nativeButton={false}
          />
          <div className="hidden sm:block">
            <Brand />
          </div>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <ProjectNameEditor />
          <SaveIndicator />
          <div className="ms-auto flex items-center gap-1">
            <ExportButton />
            <LocaleSwitcher />
            <ThemeToggle />
            <IconButton
              label={t("workspace.togglePanel")}
              icon={
                panelOpen ? (
                  <PanelLeftClose className="rtl:rotate-180" />
                ) : (
                  <PanelLeftOpen className="rtl:rotate-180" />
                )
              }
              variant="ghost"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((o) => !o)}
            />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "w-[22rem] max-w-[85vw] shrink-0 border-e bg-background",
              !panelOpen && "hidden",
            )}
          >
            <SidePanel />
          </aside>
          <main className="relative min-w-0 flex-1">
            <MapView />
          </main>
        </div>

        <footer className="shrink-0 border-t px-3 py-1 text-[11px] text-muted-foreground">
          {t("app.disclaimerShort")}
        </footer>

        <DisclaimerDialog />
      </div>
    </MapProvider>
  );
}

function ExportButton() {
  const t = useTranslations();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await useWorkspaceStore.getState().flush();
        const project = useWorkspaceStore.getState().project;
        if (!project) return;
        exportProjectFile(project);
        toast.success(t("toast.exported"));
      }}
    >
      <Download /> <span className="hidden sm:inline">{t("common.export")}</span>
    </Button>
  );
}

function useSaveErrorToast() {
  const t = useTranslations("toast");
  const saveState = useWorkspaceStore((s) => s.saveState);
  const shown = useRef(false);
  useEffect(() => {
    if (saveState === "error" && !shown.current) {
      shown.current = true;
      toast.error(t("saveFailed"));
    }
    if (saveState === "saved") shown.current = false;
  }, [saveState, t]);
}
