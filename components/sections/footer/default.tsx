import { footer } from "@/content/site";
import { cn } from "@/lib/utils";

import Meridian from "../../logos/meridian";
import {
  Footer,
  FooterBottom,
  FooterColumn,
  FooterContent,
} from "../../ui/footer";
import { ModeToggle } from "../../ui/mode-toggle";

export default function FooterSection({ className }: { className?: string }) {
  return (
    <footer className={cn("bg-background w-full px-4", className)}>
      <div className="max-w-container mx-auto">
        <Footer>
          <FooterContent className="md:grid-cols-4 lg:grid-cols-4">
            <FooterColumn className="col-span-2 sm:col-span-3 md:col-span-1">
              <Meridian className="w-fit text-2xl" />
            </FooterColumn>
            {footer.columns.map((column) => (
              <FooterColumn key={column.title}>
                <h3 className="text-md pt-1 font-semibold">{column.title}</h3>
                {column.links.map((link) => (
                  <a
                    key={link.text}
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground py-1 text-sm"
                  >
                    {link.text}
                  </a>
                ))}
              </FooterColumn>
            ))}
          </FooterContent>
          <p className="text-muted-foreground border-border dark:border-border/15 mt-8 max-w-3xl border-t pt-6 text-xs text-pretty">
            {footer.risk}
          </p>
          <FooterBottom className="mt-6">
            <div>{footer.bottom}</div>
            <ModeToggle />
          </FooterBottom>
        </Footer>
      </div>
    </footer>
  );
}
