import { cn } from "@/lib/utils";

/** A titled group of settings with an icon, like a section of a settings page. */
export function SettingsGroup({
  id,
  icon: Icon,
  title,
  description,
  columns = 1,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** 2 places the panels side by side on wide screens. */
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="text-brand size-4" aria-hidden="true" />
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      <div
        className={cn(
          "grid grid-cols-1 items-start gap-4",
          columns === 2 && "xl:grid-cols-2",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** A card inside a group, with its own small title and optional action on the right. */
export function SettingsPanel({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "bg-card min-w-0 scroll-mt-24 rounded-xl border p-5",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-medium">{title}</h3>}
            {description && (
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** A read-only label and value pair. */
export function SettingValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="truncate text-sm font-medium">{children}</span>
    </div>
  );
}

/** A card of settings rows separated by lines. */
export function SettingsRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card divide-y rounded-xl border", className)}>
      {children}
    </div>
  );
}

/** One setting: its name and help on the left, the value or control on the right. */
export function SettingsRow({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="grid scroll-mt-24 grid-cols-1 gap-4 p-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8"
    >
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
