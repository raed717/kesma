"use client";

import {
  ArrowDown,
  ArrowUp,
  Droplets,
  Home,
  MapPin,
  Route,
  Shapes,
  Sprout,
  Trash2,
  Warehouse,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { length as turfLength, feature } from "@turf/turf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AssetSchema,
  ValueZoneSchema,
  type Asset,
  type FrontageLine,
  type ValueZone,
} from "@/domain/model/project";
import { BENEFICIARY_COLORS } from "@/domain/shares";
import { formatLength } from "@/domain/units";
import { cn } from "@/lib/utils";
import { useMapUiStore, type MapTool, type ValueItemRef } from "@/store/map-ui-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { formatMoney, useValueData } from "./use-value-data";

const NO_LOTS: never[] = [];
const ASSET_KINDS = AssetSchema.shape.kind.options;
const ZONE_MODES = ValueZoneSchema.shape.mode.options;
const KIND_ICON: Record<Asset["kind"], ReactNode> = {
  well: <Droplets />,
  building: <Home />,
  trees: <Sprout />,
  infrastructure: <Warehouse />,
  other: <MapPin />,
};

export function ValuePanel() {
  const t = useTranslations("value");
  const locale = useLocale();
  const ids = useId();
  const project = useWorkspaceStore((s) => s.project);
  const update = useWorkspaceStore((s) => s.update);
  const { tool, setTool, selectedValueItem, selectValueItem } = useMapUiStore();
  const { enabled, propertyValue, currency } = useValueData(NO_LOTS);
  if (!project) return null;
  const { valueZones: zones, assets, frontageLines: frontage, settings } = project;

  const toggleTool = (t: MapTool) => setTool(tool === t ? "pan" : t);
  const isSel = (kind: ValueItemRef["kind"], id: string) =>
    selectedValueItem?.kind === kind && selectedValueItem.id === id;
  const select = (kind: ValueItemRef["kind"], id: string) =>
    selectValueItem(isSel(kind, id) ? null : { kind, id });

  return (
    <div className="space-y-5 p-4 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">{t("propertyValue")}</p>
        <p className="text-xl font-semibold tabular-nums" data-testid="property-value">
          {enabled ? formatMoney(propertyValue, currency, locale) : "—"}
        </p>
        {!enabled && <p className="mt-1 text-xs text-muted-foreground">{t("noValueYet")}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-base`}>{t("baseValue", { currency: settings.currency })}</Label>
        <Input
          key={settings.baseValuePerM2 ?? "none"}
          id={`${ids}-base`}
          type="number"
          min={0}
          step="any"
          placeholder="0"
          defaultValue={settings.baseValuePerM2 ?? ""}
          className="w-40 tabular-nums"
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const value = raw === "" ? null : Number(raw);
            if (value !== null && (!Number.isFinite(value) || value < 0)) {
              e.target.value = String(settings.baseValuePerM2 ?? "");
              return;
            }
            if (value !== settings.baseValuePerM2)
              update((d) => void (d.settings.baseValuePerM2 = value));
          }}
        />
        <p className="text-xs text-muted-foreground">{t("baseValueHint")}</p>
      </div>

      {/* ---------- zones ---------- */}
      <Section
        title={t("zones.title")}
        hint={t("zones.hint")}
        action={
          <Button
            size="xs"
            variant={tool === "draw-zone" ? "secondary" : "outline"}
            onClick={() => toggleTool("draw-zone")}
          >
            <Shapes /> {t("zones.add")}
          </Button>
        }
      >
        {zones.map((z, i) => (
          <Item
            key={z.id}
            selected={isSel("zone", z.id)}
            onClick={() => select("zone", z.id)}
            icon={<span className="size-3 rounded-sm" style={{ backgroundColor: z.color }} />}
            title={z.name}
            detail={zoneValueLabel(z, settings.currency, locale, t)}
          >
            <ZoneEditor zone={z} index={i} count={zones.length} />
          </Item>
        ))}
      </Section>

      {/* ---------- assets ---------- */}
      <Section
        title={t("assets.title")}
        hint={t("assets.hint")}
        action={
          <div className="flex gap-1">
            <Button
              size="xs"
              variant={tool === "draw-asset-point" ? "secondary" : "outline"}
              onClick={() => toggleTool("draw-asset-point")}
            >
              <MapPin /> {t("assets.addPoint")}
            </Button>
            <Button
              size="xs"
              variant={tool === "draw-asset-area" ? "secondary" : "outline"}
              onClick={() => toggleTool("draw-asset-area")}
            >
              <Shapes /> {t("assets.addArea")}
            </Button>
          </div>
        }
      >
        {assets.map((a) => (
          <Item
            key={a.id}
            selected={isSel("asset", a.id)}
            onClick={() => select("asset", a.id)}
            icon={<span className="text-sky-600 [&_svg]:size-4">{KIND_ICON[a.kind]}</span>}
            title={a.name}
            detail={formatMoney(a.value, settings.currency, locale)}
          >
            <AssetEditor asset={a} />
          </Item>
        ))}
      </Section>

      {/* ---------- frontage ---------- */}
      <Section
        title={t("frontage.title")}
        hint={t("frontage.hint")}
        action={
          <Button
            size="xs"
            variant={tool === "draw-frontage" ? "secondary" : "outline"}
            onClick={() => toggleTool("draw-frontage")}
          >
            <Route /> {t("frontage.add")}
          </Button>
        }
      >
        {frontage.map((f) => (
          <Item
            key={f.id}
            selected={isSel("frontage", f.id)}
            onClick={() => select("frontage", f.id)}
            icon={<span className="h-1 w-4 rounded bg-purple-500" />}
            title={f.name}
            detail={formatLength(
              turfLength(feature(f.geometry), { units: "kilometers" }) * 1000,
              locale,
            )}
          >
            <FrontageEditor line={f} />
          </Item>
        ))}
      </Section>

      <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}

export function zoneValueLabel(
  z: ValueZone,
  currency: string,
  locale: string,
  t: ReturnType<typeof useTranslations<"value">>,
) {
  return z.mode === "multiplier"
    ? `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(z.value)}`
    : t("zones.perM2Label", {
        value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(z.value),
        currency,
      });
}

// ---------- editors ----------

function useCollectionUpdate<K extends "valueZones" | "assets" | "frontageLines">(
  key: K,
  id: string,
) {
  const update = useWorkspaceStore((s) => s.update);
  type Item = NonNullable<ReturnType<typeof useWorkspaceStore.getState>["project"]>[K][number];
  return {
    patch: (recipe: (item: Item) => void) =>
      update((d) => {
        const item = (d[key] as Item[]).find((x) => x.id === id);
        if (item) recipe(item);
      }),
    remove: () => {
      update((d) => void ((d[key] as Item[]) = (d[key] as Item[]).filter((x) => x.id !== id)), {
        immediate: true,
      });
      useMapUiStore.getState().selectValueItem(null);
    },
  };
}

function NameField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const t = useTranslations("value");
  const ids = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={ids}>{t("name")}</Label>
      <Input
        key={value}
        id={ids}
        defaultValue={value}
        maxLength={60}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== value) onCommit(v);
          else e.target.value = value;
        }}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  step = "any",
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: string;
}) {
  const ids = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={ids}>{label}</Label>
      <Input
        key={value}
        id={ids}
        type="number"
        min={0}
        step={step}
        defaultValue={value}
        className="w-36 tabular-nums"
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v);
          else e.target.value = String(value);
        }}
      />
    </div>
  );
}

function ZoneEditor({ zone, index, count }: { zone: ValueZone; index: number; count: number }) {
  const t = useTranslations("value");
  const ids = useId();
  const settings = useWorkspaceStore((s) => s.project?.settings);
  const update = useWorkspaceStore((s) => s.update);
  const { patch, remove } = useCollectionUpdate("valueZones", zone.id);
  const move = (delta: number) =>
    update((d) => {
      const i = d.valueZones.findIndex((z) => z.id === zone.id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.valueZones.length) return;
      [d.valueZones[i], d.valueZones[j]] = [d.valueZones[j], d.valueZones[i]];
    });
  return (
    <div className="space-y-3">
      <NameField value={zone.name} onCommit={(v) => patch((z) => void (z.name = v))} />
      <div className="space-y-1">
        <Label htmlFor={`${ids}-mode`}>{t("zones.mode")}</Label>
        <select
          id={`${ids}-mode`}
          value={zone.mode}
          onChange={(e) => patch((z) => void (z.mode = e.target.value as ValueZone["mode"]))}
          className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30"
        >
          {ZONE_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`zones.modes.${m}`, { currency: settings?.currency ?? "" })}
            </option>
          ))}
        </select>
        {zone.mode === "multiplier" && !(settings?.baseValuePerM2 ?? 0) && (
          <p className="text-xs text-amber-700 dark:text-amber-400">{t("zones.needsBase")}</p>
        )}
      </div>
      <NumberField
        label={
          zone.mode === "multiplier"
            ? t("zones.multiplier")
            : t("zones.perM2", { currency: settings?.currency ?? "" })
        }
        value={zone.value}
        onCommit={(v) => patch((z) => void (z.value = v))}
      />
      <div className="flex flex-wrap gap-1.5" aria-label={t("color")}>
        {BENEFICIARY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={zone.color === c}
            onClick={() => patch((z) => void (z.color = c))}
            className={cn(
              "size-5 rounded-full border-2 border-background",
              zone.color === c && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            size="icon-xs"
            variant="outline"
            aria-label={t("zones.up")}
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            aria-label={t("zones.down")}
            disabled={index === count - 1}
            onClick={() => move(1)}
          >
            <ArrowDown />
          </Button>
          <span className="self-center text-xs text-muted-foreground">{t("zones.priority")}</span>
        </div>
        <DeleteButton onClick={remove} />
      </div>
    </div>
  );
}

function AssetEditor({ asset }: { asset: Asset }) {
  const t = useTranslations("value");
  const ids = useId();
  const currency = useWorkspaceStore((s) => s.project?.settings.currency ?? "");
  const { patch, remove } = useCollectionUpdate("assets", asset.id);
  return (
    <div className="space-y-3">
      <NameField value={asset.name} onCommit={(v) => patch((a) => void (a.name = v))} />
      <div className="space-y-1">
        <Label htmlFor={`${ids}-kind`}>{t("assets.kind")}</Label>
        <select
          id={`${ids}-kind`}
          value={asset.kind}
          onChange={(e) => patch((a) => void (a.kind = e.target.value as Asset["kind"]))}
          className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30"
        >
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`assets.kinds.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        label={t("assets.value", { currency })}
        value={asset.value}
        onCommit={(v) => patch((a) => void (a.value = v))}
      />
      <p className="text-xs text-muted-foreground">
        {asset.geometry.type === "Point" ? t("assets.pointRule") : t("assets.areaRule")}
      </p>
      <div className="flex justify-end">
        <DeleteButton onClick={remove} />
      </div>
    </div>
  );
}

function FrontageEditor({ line }: { line: FrontageLine }) {
  const { patch, remove } = useCollectionUpdate("frontageLines", line.id);
  return (
    <div className="space-y-3">
      <NameField value={line.name} onCommit={(v) => patch((f) => void (f.name = v))} />
      <div className="flex justify-end">
        <DeleteButton onClick={remove} />
      </div>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("common");
  return (
    <Button size="xs" variant="destructive" onClick={onClick}>
      <Trash2 /> {t("delete")}
    </Button>
  );
}

// ---------- layout ----------

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  action: ReactNode;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </div>
      {items === 0 ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : (
        <ul className="divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

function Item({
  selected,
  onClick,
  icon,
  title,
  detail,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-expanded={selected}
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-muted/60",
          selected && "bg-muted",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{detail}</span>
      </button>
      {selected && <div className="bg-muted/30 px-3 pt-1 pb-3">{children}</div>}
    </li>
  );
}
