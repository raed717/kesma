"use client";

import { History, RotateCcw, Save, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newId } from "@/domain/model/factories";
import type { Scenario } from "@/domain/model/project";
import { useMapUiStore } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { dismissLotUndo } from "./scenario-state";

type Props = { scenario: Scenario; open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Named versions of a scenario: save the current lots under a name, restore any version
 * later (restoring is itself undoable), or delete it.
 *
 * Lots are immutable snapshots, so versions share them by reference — no copying (and no
 * structuredClone on immer drafts, which throws).
 */
export function VersionsDialog({ scenario, open, onOpenChange }: Props) {
  const t = useTranslations("versions");
  const format = useFormatter();
  const ids = useId();
  const update = useWorkspaceStore((s) => s.update);
  const [name, setName] = useState("");

  function save() {
    const label = name.trim() || t("defaultName", { n: scenario.versions.length + 1 });
    update(
      (d) => {
        const s = d.scenarios.find((x) => x.id === scenario.id);
        if (!s) return;
        s.versions.unshift({
          id: newId(),
          name: label,
          createdAt: new Date().toISOString(),
          lots: scenario.lots,
        });
      },
      { immediate: true },
    );
    setName("");
    toast.success(t("saved", { name: label }));
  }

  function restore(versionId: string) {
    const version = scenario.versions.find((v) => v.id === versionId);
    if (!version) return;
    dismissLotUndo();
    update(
      (d) => {
        const s = d.scenarios.find((x) => x.id === scenario.id);
        if (!s) return;
        s.lots = version.lots;
        s.updatedAt = new Date().toISOString();
      },
      { immediate: true },
    );
    useMapUiStore.setState({ selectedLotIds: [], selectedIssueId: null });
    toast.success(t("restored", { name: version.name }));
    onOpenChange(false);
  }

  function remove(versionId: string) {
    update(
      (d) => {
        const s = d.scenarios.find((x) => x.id === scenario.id);
        if (s) s.versions = s.versions.filter((v) => v.id !== versionId);
      },
      { immediate: true },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: scenario.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`${ids}-name`}>{t("nameLabel")}</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              maxLength={60}
              placeholder={t("defaultName", { n: scenario.versions.length + 1 })}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit">
            <Save /> {t("save")}
          </Button>
        </form>

        {scenario.versions.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <History className="size-4" /> {t("empty")}
          </p>
        ) : (
          <ul
            className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm"
            aria-label={t("listLabel")}
          >
            {scenario.versions.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(v.createdAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {t("lots", { count: v.lots.length })}
                  </p>
                </div>
                <Button size="xs" variant="outline" onClick={() => restore(v.id)}>
                  <RotateCcw /> {t("restore")}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t("delete", { name: v.name })}
                  onClick={() => remove(v.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
