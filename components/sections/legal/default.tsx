import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { legal } from "@/content/site";

import { LayoutLines } from "../../ui/layout-lines";
import { Section } from "../../ui/section";
import FooterSection from "../footer/default";
import Navbar from "../navbar/default";

export default function LegalPage({
  page,
}: {
  page: keyof typeof legal.pages;
}) {
  const content = legal.pages[page];
  return (
    <>
      <LayoutLines />
      <Navbar />
      <main id="main" className="min-h-[60vh]">
        <Section aria-labelledby="legal-title">
          <article className="mx-auto flex max-w-[720px] flex-col gap-8">
            <div className="flex flex-col gap-4">
              <Link
                href="/"
                className="text-brand inline-flex w-fit items-center gap-2 text-sm font-medium"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {legal.back}
              </Link>
              <h1
                id="legal-title"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
              >
                {content.title}
              </h1>
              <p className="text-muted-foreground text-sm">
                {legal.updatedLabel}: {legal.updated}
              </p>
              <p
                role="note"
                className="border-gold/50 bg-gold/10 rounded-lg border px-3 py-2 text-sm"
              >
                {legal.draftNotice}
              </p>
              <p className="text-muted-foreground text-base text-pretty">
                {content.intro}
              </p>
            </div>
            {content.sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  {section.heading}
                </h2>
                {section.body.map((p) => (
                  <p
                    key={p}
                    className="text-muted-foreground text-sm leading-relaxed text-pretty"
                  >
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </article>
        </Section>
      </main>
      <FooterSection />
    </>
  );
}
