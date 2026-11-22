import { ScrollToTop } from "@/components/scroll-to-top";
import CTA from "@/components/sections/cta/default";
import FAQ from "@/components/sections/faq/default";
import Footer from "@/components/sections/footer/default";
import Hero from "@/components/sections/hero/default";
import HowItWorks from "@/components/sections/how-it-works/default";
import Items from "@/components/sections/items/default";
import Logos from "@/components/sections/logos/default";
import Navbar from "@/components/sections/navbar/default";
import Policies from "@/components/sections/policies/default";
import Security from "@/components/sections/security/default";
import { LayoutLines } from "@/components/ui/layout-lines";

export default function Home() {
  return (
    <>
      <ScrollToTop />
      <LayoutLines />
      <Navbar />
      <main id="main" className="bg-background text-foreground w-full">
        <Hero />
        <Logos />
        <Items />
        <HowItWorks />
        <Policies />
        <Security />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
