import { ArrowRightIcon } from "lucide-react";

import { hero } from "@/content/site";
import { cn } from "@/lib/utils";

import { OrderStatusMockup } from "../../mockups/order-status";
import { Badge } from "../../ui/badge";
import Glow from "../../ui/glow";
import { KineticText } from "../../ui/kinetic-text";
import { Mockup, MockupFrame } from "../../ui/mockup";
import { Section } from "../../ui/section";
import HeroActions from "./hero-actions";

export default function Hero({ className }: { className?: string }) {
  return (
    <Section
      aria-labelledby="hero-title"
      className={cn(
        "fade-bottom overflow-hidden pt-10 pb-0 sm:pt-14 sm:pb-0 md:pt-16 md:pb-0",
        className,
      )}
    >
      <div className="max-w-container mx-auto flex flex-col gap-12 sm:gap-24">
        <div className="flex flex-col items-center gap-5 text-center sm:gap-7">
          <Badge variant="outline" className="animate-appear">
            <span className="text-muted-foreground">{hero.badge}</span>
            <a
              href={hero.badgeLink.href}
              className="text-brand flex items-center gap-1"
            >
              {hero.badgeLink.text}
              <ArrowRightIcon className="size-3" aria-hidden="true" />
            </a>
          </Badge>
          <h1
            id="hero-title"
            className="animate-appear relative z-10 text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.1] font-bold tracking-[-0.025em] text-balance drop-shadow-2xl"
          >
            <KineticText
              as="span"
              text={hero.titleLine1}
              className="dark:from-foreground dark:to-muted-foreground dark:bg-linear-to-r dark:bg-clip-text dark:text-transparent"
            />
            <KineticText
              as="span"
              text={hero.titleLine2}
              className="from-brand to-brand-foreground dark:to-foreground bg-linear-to-r bg-clip-text text-transparent"
            />
          </h1>
          <p className="animate-appear text-muted-foreground relative z-10 max-w-[56ch] text-base font-medium text-balance opacity-0 delay-100 sm:text-lg">
            {hero.description}
          </p>
          <div className="animate-appear relative z-10 w-full opacity-0 delay-300">
            <HeroActions />
          </div>
          <div className="relative mx-auto w-full max-w-xl pt-8 sm:pt-12">
            <p className="sr-only">{hero.mockupAlt}</p>
            <MockupFrame
              className="animate-appear opacity-0 delay-700"
              size="small"
            >
              <Mockup
                type="responsive"
                className="bg-background/90 w-full rounded-xl border-0"
                aria-hidden="true"
                inert
              >
                <OrderStatusMockup />
              </Mockup>
            </MockupFrame>
            <Glow
              variant="top"
              className="animate-appear-zoom opacity-0 delay-1000"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
