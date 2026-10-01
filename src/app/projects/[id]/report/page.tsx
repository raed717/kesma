import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReportScreen } from "@/features/project-pages/report-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("report");
  return { title: t("title") };
}

export default async function ReportPage(props: PageProps<"/projects/[id]/report">) {
  const { id } = await props.params;
  const { scenario } = await props.searchParams;
  return (
    <ReportScreen
      projectId={id}
      initialScenario={typeof scenario === "string" ? scenario : undefined}
    />
  );
}
