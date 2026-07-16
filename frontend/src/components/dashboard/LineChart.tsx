import { useMemo, useState } from "react";

interface Point {
  date: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function defaultFormatLabel(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function LineChart({
  data,
  formatLabel = defaultFormatLabel,
  ariaLabel = "Trend chart",
}: {
  data: Point[];
  formatLabel?: (date: string) => string;
  ariaLabel?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxValue = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 1)), [data]);
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const points = data.map((d, i) => {
    const x = PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = PAD_TOP + innerH - (d.value / maxValue) * innerH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_TOP + innerH} L${points[0].x},${
    PAD_TOP + innerH
  } Z`;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, (x - PAD_LEFT) / innerW));
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIndex(idx);
  }

  const labelEvery = Math.ceil(data.length / 5);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {/* gridlines */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD_TOP + innerH * (1 - frac);
          return (
            <line
              key={frac}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          );
        })}
        {/* y axis labels */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD_TOP + innerH * (1 - frac);
          return (
            <text key={frac} x={PAD_LEFT - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">
              {Math.round(maxValue * frac).toLocaleString()}
            </text>
          );
        })}
        {/* x axis labels (sparse) */}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={p.x}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted-foreground)"
            >
              {formatLabel(p.date)}
            </text>
          ) : null
        )}

        {/* area fill */}
        <path d={areaPath} fill="var(--color-primary)" opacity={0.1} stroke="none" />
        {/* line */}
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* end value direct label */}
        {points.length > 0 && (
          <text
            x={points[points.length - 1].x}
            y={points[points.length - 1].y - 10}
            textAnchor="end"
            fontSize={11}
            fontWeight={600}
            fill="var(--color-foreground)"
          >
            {points[points.length - 1].value.toLocaleString()}
          </text>
        )}

        {/* crosshair + hover point */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={PAD_TOP + innerH}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={5} fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth={2} />
          </>
        )}

        {/* hover hit target */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100}%`,
            transform: "translate(-50%, -130%)",
          }}
        >
          <p className="font-medium text-foreground">{hovered.value.toLocaleString()}</p>
          <p className="text-muted-foreground">{formatLabel(hovered.date)}</p>
        </div>
      )}
    </div>
  );
}
