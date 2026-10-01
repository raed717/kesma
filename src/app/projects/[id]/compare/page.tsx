import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CompareScreen } from "@/features/project-pages/compare-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compare");
  return { title: t("title") };
}

export default async function ComparePage(props: PageProps<"/projects/[id]/compare">) {
  const { id } = await props.params;
  const { scenario } = await props.searchParams;
  return (
    <CompareScreen
      projectId={id}
      initialScenario={typeof scenario === "string" ? scenario : undefined}
    />
  );
}
