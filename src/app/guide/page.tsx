import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type GuideSection = { title: string; items: string[] };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide");
  return { title: t("title") };
}

export default async function GuidePage() {
  const t = await getTranslations();
  const sections = t.raw("guide.sections") as GuideSection[];

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Brand />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("guide.title")}</h1>
          <p className="text-muted-foreground">{t("guide.intro")}</p>
          <p className="rounded-lg border bg-primary/5 p-3 text-sm">{t("guide.tryDemo")}</p>
        </div>
        {sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="font-semibold">{t("guide.limitsTitle")}</h2>
          <p className="text-sm leading-relaxed">{t("guide.limits")}</p>
        </section>
        <Button render={<Link href="/" />} nativeButton={false} variant="outline">
          <ArrowLeft className="rtl:rotate-180" /> {t("workspace.backToProjects")}
        </Button>
      </main>
    </div>
  );
}
