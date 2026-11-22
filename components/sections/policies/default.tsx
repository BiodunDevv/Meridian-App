import Link from "next/link";

import { appLinks, policies } from "@/content/site";

import { Button } from "../../ui/button";
import { Section } from "../../ui/section";

export default function Policies() {
  const { delivery, refunds, support } = policies;
  return (
    <Section
      id={policies.id}
      aria-labelledby="policies-title"
      className="reveal"
    >
      <div className="max-w-container mx-auto flex flex-col items-center gap-10 sm:gap-16">
        <h2
          id="policies-title"
          className="max-w-[640px] text-center text-[clamp(1.625rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight text-balance"
        >
          {policies.title}
        </h2>
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="bg-card border-border dark:border-border/10 flex flex-col gap-4 rounded-xl border p-5 shadow-md">
            <h3 className="text-lg font-semibold">{delivery.title}</h3>
            <p className="text-muted-foreground text-sm text-pretty">
              {delivery.intro}
            </p>
            <dl className="divide-y text-sm">
              {delivery.rows.map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-3 sm:gap-4"
                >
                  <dt className="font-medium">{k}</dt>
                  <dd className="text-muted-foreground sm:col-span-2">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground text-xs">{delivery.outro}</p>
          </div>
          <div className="bg-card border-border dark:border-border/10 flex flex-col gap-4 rounded-xl border p-5 shadow-md">
            <h3 className="text-lg font-semibold">{refunds.title}</h3>
            <ul className="text-muted-foreground flex list-disc flex-col gap-2 pl-5 text-sm text-pretty">
              {refunds.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Link
              href={refunds.link.href}
              className="text-brand text-sm font-medium underline-offset-4 hover:underline"
            >
              {refunds.link.text}
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <h3 className="text-lg font-semibold">{support.title}</h3>
          <p className="text-muted-foreground max-w-[520px] text-sm text-pretty">
            {support.copy}
          </p>
          <Button variant="outline" asChild>
            <a href={appLinks.register}>{support.cta}</a>
          </Button>
        </div>
      </div>
    </Section>
  );
}
