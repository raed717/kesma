"use client";

import { Layers, Map as MapIcon, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMapUiStore, type WorkspacePanel } from "@/store/map-ui-store";
import { BeneficiariesPanel } from "../beneficiaries/beneficiaries-panel";
import { PropertyPanel } from "../property/property-panel";
import { ScenariosPanel } from "../scenarios/scenarios-panel";
import { GettingStarted } from "./getting-started";
import { SettingsPanel } from "./settings-panel";

export function SidePanel() {
  const t = useTranslations("workspace");
  // The active tab also drives what the map shows (parcels vs. scenario lots).
  const panel = useMapUiStore((s) => s.panel);
  const setPanel = useMapUiStore((s) => s.setPanel);

  return (
    <Tabs
      value={panel}
      onValueChange={(v) => setPanel(v as WorkspacePanel)}
      className="h-full gap-0"
    >
      <div className="border-b p-2">
        <TabsList className="w-full">
          <TabsTrigger value="property">
            <MapIcon /> <span className="truncate">{t("tabs.property")}</span>
          </TabsTrigger>
          <TabsTrigger value="beneficiaries">
            <Users /> <span className="truncate">{t("tabs.beneficiaries")}</span>
          </TabsTrigger>
          <TabsTrigger value="scenarios">
            <Layers /> <span className="truncate">{t("tabs.scenarios")}</span>
          </TabsTrigger>
          <TabsTrigger value="settings" aria-label={t("tabs.settings")} className="flex-none px-2">
            <Settings />
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <GettingStarted />
        <TabsContent value="property">
          <PropertyPanel />
        </TabsContent>
        <TabsContent value="beneficiaries">
          <BeneficiariesPanel />
        </TabsContent>
        <TabsContent value="scenarios">
          <ScenariosPanel />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}
