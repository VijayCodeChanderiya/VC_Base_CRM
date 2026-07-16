import { useState } from "react";

interface BarDatum {
  name: string;
  value: number;
}

export function BarChart({ data }: { data: BarDatum[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => {
        const widthPct = (d.value / maxValue) * 100;
        return (
          <div
            key={d.name}
            className="flex items-center gap-3 text-sm"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span className="w-32 shrink-0 truncate text-muted-foreground" title={d.name}>
              {d.name}
            </span>
            <div className="flex-1 relative h-5 rounded-sm bg-muted overflow-hidden">
              <div
                className="h-full rounded-r-[4px] transition-all"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: "var(--color-primary)",
                  opacity: hoverIndex === i ? 1 : 0.85,
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-medium text-foreground tabular-nums">
              {d.value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
