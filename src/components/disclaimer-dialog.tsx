"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "kesma.disclaimerAccepted.v1";

function readAccepted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // Storage unavailable (private mode…): show the dialog every time.
  }
}

const noopSubscribe = () => () => {};

/** Shown on first launch (per browser). Legal position §19 of the project context. */
export function DisclaimerDialog() {
  const t = useTranslations("disclaimer");
  // Server snapshot = "accepted" so nothing flashes during SSR/hydration.
  const accepted = useSyncExternalStore(noopSubscribe, readAccepted, () => true);
  const [dismissed, setDismissed] = useState(false);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <Dialog open={!accepted && !dismissed} onOpenChange={(next) => !next && accept()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Scale className="size-5" />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{t("body1")}</span>
            <span className="block font-medium text-foreground">{t("body2")}</span>
            <span className="block">{t("body3")}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={accept} autoFocus>
            {t("accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
