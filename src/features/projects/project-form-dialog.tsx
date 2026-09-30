"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ProjectFormValues = { name: string; description?: string };

type FormProps = {
  title: string;
  description?: string;
  submitLabel: string;
  initialValues?: ProjectFormValues;
  withDescription?: boolean;
  onSubmit: (values: ProjectFormValues) => Promise<void> | void;
};

type Props = FormProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProjectFormDialog({ open, onOpenChange, ...formProps }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The popup unmounts when closed, so the form starts fresh on every open. */}
        <ProjectForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  title,
  description,
  submitLabel,
  initialValues,
  withDescription = false,
  onSubmit,
  onDone,
}: FormProps & { onDone: () => void }) {
  const t = useTranslations();
  const ids = useId();
  const [name, setName] = useState(initialValues?.name ?? "");
  const [desc, setDesc] = useState(initialValues?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("projectForm.nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), description: desc.trim() || undefined });
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-name`}>{t("common.name")}</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={120}
          autoFocus
          placeholder={t("projectForm.namePlaceholder")}
          aria-invalid={!!error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      {withDescription && (
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-desc`}>
            {t("common.description")}{" "}
            <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
          </Label>
          <Textarea
            id={`${ids}-desc`}
            value={desc}
            maxLength={2000}
            rows={3}
            placeholder={t("projectForm.descriptionPlaceholder")}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
