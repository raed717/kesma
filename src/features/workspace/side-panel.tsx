"use client";

import { Layers, Map as MapIcon, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyPanel } from "../property/property-panel";
import { SettingsPanel } from "./settings-panel";

export function SidePanel() {
  const t = useTranslations("workspace");

  return (
    <Tabs defaultValue="property" className="h-full gap-0">
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
        <TabsContent value="property">
          <PropertyPanel />
        </TabsContent>
        <TabsContent value="beneficiaries">
          <EmptyState
            icon={<Users />}
            title={t("beneficiaries.empty")}
            body={t("beneficiaries.emptyBody")}
          />
        </TabsContent>
        <TabsContent value="scenarios">
          <EmptyState
            icon={<Layers />}
            title={t("scenarios.empty")}
            body={t("scenarios.emptyBody")}
          />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <p className="mt-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        {t("comingSoon")}
      </p>
    </div>
  );
}
