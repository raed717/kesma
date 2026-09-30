"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";

/** Inline-editable project title. Commits on blur / Enter, reverts on Escape. */
export function ProjectNameEditor() {
  const t = useTranslations("workspace");
  const name = useWorkspaceStore((s) => s.project?.name ?? "");
  const update = useWorkspaceStore((s) => s.update);
  // Only holds a value while the user is editing; otherwise the store is the source of truth.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  function commit() {
    const next = draft?.trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next && next !== name) update((d) => void (d.name = next));
  }

  return (
    <input
      aria-label={t("projectName")}
      value={draft ?? name}
      maxLength={120}
      onFocus={() => setDraft(name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="max-w-[40ch] min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30"
    />
  );
}
