import FooterSection from "@/components/sections/footer/default";
import Navbar from "@/components/sections/navbar/default";
import { LayoutLines } from "@/components/ui/layout-lines";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LayoutLines />
      <Navbar />
      <main
        id="main"
        className="bg-background text-foreground min-h-[60vh] w-full"
      >
        {children}
      </main>
      <FooterSection />
    </>
  );
}
