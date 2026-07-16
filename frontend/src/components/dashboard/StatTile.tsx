import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "warning" | "critical";

const toneClasses: Record<Tone, string> = {
  default: "",
  warning: "border-l-4 border-l-[#fab219]",
  critical: "border-l-4 border-l-[#d03b3b]",
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
  onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone?: Tone;
  prefix?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 flex flex-col gap-1 select-none text-left transition-shadow",
        onClick ? "cursor-pointer hover:shadow-md hover:border-primary/40" : "cursor-default",
        toneClasses[tone]
      )}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold text-foreground">
        {prefix}
        {formatCompact(value)}
      </p>
      {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
    </Card>
  );
}
