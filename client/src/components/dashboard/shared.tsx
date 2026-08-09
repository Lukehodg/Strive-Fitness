// Small building blocks reused across dashboard pages.

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  /** undefined = neutral, otherwise colors the value green/red. */
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold tabular mt-1",
            tone === "positive" && "text-gain",
            tone === "negative" && "text-loss",
          )}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1 tabular">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const KIND_STYLES: Record<string, string> = {
  order: "bg-gain-soft text-gain border-transparent",
  risk_block: "bg-amber-50 text-amber-700 border-transparent",
  strategy_switch: "bg-indigo-50 text-primary border-transparent",
  halt: "bg-loss-soft text-loss border-transparent",
  resume: "bg-blue-50 text-blue-700 border-transparent",
  signal: "bg-secondary text-secondary-foreground border-transparent",
  info: "bg-secondary text-secondary-foreground border-transparent",
};

export function KindBadge({ kind }: { kind: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs shrink-0 font-normal", KIND_STYLES[kind] ?? KIND_STYLES.info)}>
      {kind.replace("_", " ")}
    </Badge>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Section wrapper for Settings — a titled card with an optional description. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** A labelled toggle row — the on/off settings pattern used throughout Settings. */
export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** Optional extra controls shown under the description, e.g. a slider that this toggle gates. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 mt-0.5" />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
