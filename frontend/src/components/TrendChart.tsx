import { useState } from "react";

type Point = { label: string; value: number };

/** Dependency-free line chart for one metric across eval runs — this
 * project's Tailwind-only frontend has no charting library installed, and
 * a handful of points across runs doesn't need one. Assumes a fixed 0–1
 * (shown as 0–100%) domain since every metric it's used for is a
 * fraction — a real axis a viewer can read values off, not just a shape. */
export function TrendChart({
  points,
  color = "var(--brand-blue)",
  height = 96,
  target,
}: {
  points: Point[];
  color?: string;
  height?: number;
  /** Optional 0–1 reference value shown as a dashed line, e.g. a quality bar. */
  target?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) return null;

  const padTop = 10;
  const padBottom = 22; // room for x-axis run labels
  const padLeft = 34; // room for y-axis % labels
  const plotHeight = height - padTop - padBottom;
  const width = Math.max(280, points.length * 56) + padLeft;
  const plotWidth = width - padLeft - 8;

  const yFor = (v: number) => padTop + (1 - Math.max(0, Math.min(1, v))) * plotHeight;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padLeft + (points.length > 1 ? i * stepX : plotWidth / 2),
    y: yFor(p.value),
    ...p,
  }));

  const smoothPath = coords.reduce((acc, c, i, arr) => {
    if (i === 0) return `M${c.x},${c.y}`;
    const prev = arr[i - 1];
    const cpX = (prev.x + c.x) / 2;
    return `${acc} C${cpX},${prev.y} ${cpX},${c.y} ${c.x},${c.y}`;
  }, "");
  const areaPath = `${smoothPath} L${coords[coords.length - 1].x},${padTop + plotHeight} L${coords[0].x},${padTop + plotHeight} Z`;
  const gradientId = `trend-fill-${color.replace(/[^a-z0-9]/gi, "")}`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const svgHeight = height;
  const hoveredPoint = hovered !== null ? coords[hovered] : null;

  return (
    <div className="relative">
      <svg width="100%" height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* y-axis gridlines + % labels */}
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={padLeft}
              x2={width - 4}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="currentColor"
              className="text-slate-100"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text x={padLeft - 6} y={yFor(g)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={9}>
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}

        {/* target reference line */}
        {target !== undefined && (
          <g>
            <line
              x1={padLeft}
              x2={width - 4}
              y1={yFor(target)}
              y2={yFor(target)}
              stroke="var(--metric-warn)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={smoothPath} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {coords.map((c, i) => (
          <g key={c.label}>
            <circle
              cx={c.x}
              cy={c.y}
              r={10}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            />
            {hovered === i && (
              <line x1={c.x} x2={c.x} y1={padTop} y2={padTop + plotHeight} stroke="currentColor" className="text-slate-200" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={hovered === i ? 5 : 3.5}
              fill="white"
              stroke={color}
              strokeWidth={2}
              className="transition-[r] duration-150 pointer-events-none"
            />
          </g>
        ))}
      </svg>

      {hoveredPoint && (
        <div
          className="absolute z-10 pointer-events-none rounded-lg bg-slate-900 text-white text-xs px-2.5 py-1.5 shadow-lg -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: Math.max(0, hoveredPoint.y - 44),
          }}
        >
          <div className="font-mono font-semibold">{(hoveredPoint.value * 100).toFixed(1)}%</div>
          <div className="text-slate-400 text-[10px] mt-0.5">{hoveredPoint.label}</div>
        </div>
      )}
    </div>
  );
}
