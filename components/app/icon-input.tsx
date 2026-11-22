import {
  AtSign,
  CalendarDays,
  Coins,
  DollarSign,
  Globe,
  Hash,
  IdCard,
  KeyRound,
  Lock,
  LockKeyhole,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Network,
  StickyNote,
  Tag,
  Type,
  User,
  Wallet,
} from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Default leading icon per field name, so every box reads at a glance. */
export const FIELD_ICONS: Record<string, LucideIcon> = {
  email: AtSign,
  identifier: User,
  home: MapPin,
  username: AtSign,
  password: Lock,
  current: Lock,
  next: Lock,
  confirm: LockKeyhole,
  name: User,
  fullName: User,
  code: KeyRound,
  amount: DollarSign,
  min: DollarSign,
  max: DollarSign,
  txRef: Hash,
  txHash: Hash,
  address: Wallet,
  country: Globe,
  dateOfBirth: CalendarDays,
  idNumber: IdCard,
  idType: IdCard,
  symbol: Coins,
  asset: Coins,
  network: Network,
  slug: Tag,
  tagline: Type,
  reason: MessageSquare,
  memo: StickyNote,
};

type Props = React.ComponentProps<"input"> & {
  /** Icon component. Use only from client code; server pages must pass `iconKey`. */
  icon?: LucideIcon;
  /** Key into FIELD_ICONS: a plain string, safe to pass from server components. */
  iconKey?: string;
  groupClassName?: string;
};

/** Input with a leading icon: <InputGroup><InputGroupInput/><InputGroupAddon><Icon/></InputGroupAddon></InputGroup>. */
export function IconInput({
  icon,
  iconKey,
  name,
  className,
  groupClassName,
  ...props
}: Props) {
  const Icon = icon ?? FIELD_ICONS[iconKey ?? name ?? ""] ?? MapPin;
  return (
    <InputGroup className={cn("h-10", groupClassName ?? className)}>
      <InputGroupInput name={name} {...props} />
      <InputGroupAddon align="inline-start">
        <Icon aria-hidden="true" />
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Native select with the same leading icon treatment. */
export function IconSelect({
  icon,
  name,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { icon?: LucideIcon }) {
  const Icon = icon ?? (name ? FIELD_ICONS[name] : undefined) ?? Coins;
  return (
    <div className="relative">
      <Icon
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <select
        name={name}
        className={cn(
          "border-input bg-background dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
