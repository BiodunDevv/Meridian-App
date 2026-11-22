import { features } from "@/content/site";

import { FeatureGrid } from "../../ui/feature-grid";
import { Section } from "../../ui/section";

export default function Items() {
  return (
    <Section
      id={features.id}
      aria-labelledby="features-title"
      className="reveal"
    >
      <div className="max-w-container mx-auto flex flex-col items-center gap-10 sm:gap-16">
        <h2
          id="features-title"
          className="max-w-[640px] text-center text-[clamp(1.625rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight text-balance"
        >
          {features.title}
        </h2>
        <FeatureGrid items={features.items} />
        <p className="text-muted-foreground max-w-[640px] text-center text-sm text-pretty">
          {features.note}
        </p>
      </div>
    </Section>
  );
}
