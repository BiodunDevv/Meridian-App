import {
  BadgeCheck,
  Bell,
  Gift,
  Lock,
  type LucideIcon,
  MonitorSmartphone,
  Receipt,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Tv,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

import { Item, ItemDescription, ItemIcon, ItemTitle } from "./item";

const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  Bell,
  Gift,
  Lock,
  MonitorSmartphone,
  Receipt,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Tv,
  Users,
  Wifi,
  Zap,
};

interface FeatureGridProps {
  items: readonly { icon: string; title: string; copy: string }[];
}

/** Icon + title + sentence cards, 3 columns on desktop, 2 on tablet, 1 on mobile. */
export function FeatureGrid({ items }: FeatureGridProps) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <Item
            key={item.title}
            className="bg-card border-border dark:border-border/10 gap-3 rounded-xl border p-5 shadow-md"
          >
            <ItemIcon>
              <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-lg">
                <Icon className="size-5 stroke-[1.75]" aria-hidden="true" />
              </span>
            </ItemIcon>
            <ItemTitle className="text-base">{item.title}</ItemTitle>
            <ItemDescription className="max-w-none text-pretty">
              {item.copy}
            </ItemDescription>
          </Item>
        );
      })}
    </div>
  );
}
