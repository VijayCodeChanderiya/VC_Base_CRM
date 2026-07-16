import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "warning" | "critical";

const toneBadgeClasses: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
};

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function StatTile({
  label,
  value,
  sublabel,
  tone = "default",
  prefix,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone?: Tone;
  prefix?: string;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 flex flex-col gap-2.5 select-none text-left transition-all",
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40" : "cursor-default"
      )}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
    >
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-[9px]", toneBadgeClasses[tone])}>
        <Icon size={16} />
      </div>
      <p className="text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-[26px] font-extrabold tracking-tight text-foreground">
          {prefix}
          {formatCompact(value)}
        </p>
        {sublabel && <p className="text-xs font-semibold text-muted-foreground/80">{sublabel}</p>}
      </div>
    </Card>
  );
}
