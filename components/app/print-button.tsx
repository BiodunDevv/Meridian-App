import { Printer } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Opens the printable receipt for a deposit or withdrawal in a new tab, ready to print or save as PDF. */
export function PrintButton({
  kind,
  id,
  label = "Print receipt",
}: {
  kind: "deposit" | "withdrawal";
  id: string;
  label?: string;
}) {
  return (
    <Button asChild variant="outline" size="sm" className="print:hidden">
      <Link href={`/receipt/${kind}/${id}?print=1`} target="_blank">
        <Printer /> {label}
      </Link>
    </Button>
  );
}
